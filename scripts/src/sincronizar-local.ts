import pg from "pg";
import { getSyncHeaders } from "./sync-auth";
import { getRemoteApiUrl } from "./remote-api-url";
import {
  idsLineaPendiente,
  idsLineaCreditoEnPayload,
  relacionesDeRespuesta,
  endpointDeRecuperacion,
  traducirIdsLineaCredito,
} from "./lib/credito-lineas-sync";
import {
  clasificarRespuesta,
  type DecisionRespuesta,
} from "./lib/clasificar-respuesta";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const remoteApiUrl = getRemoteApiUrl();

if (!databaseUrl) throw new Error("DATABASE_URL es obligatorio");

const LIMIT = 50;
const syncHeaders = getSyncHeaders();
const pool = new Pool({ connectionString: databaseUrl });

class ErrorSincronizacion extends Error {
  constructor(
    readonly codigoSalida: number,
    message: string,
  ) {
    super(message);
  }
}

function detenerPorRespuesta(decision: DecisionRespuesta): boolean {
  const codigoSalida =
    decision === "INTERRUMPIR"
      ? 1
      : decision === "LLAVE_RECHAZADA"
        ? 2
        : null;
  if (codigoSalida === null) return false;
  console.error(
    decision === "LLAVE_RECHAZADA"
      ? "Render rechazó la llave de sincronización; revisa SYNC_TOKEN"
      : "Render no está disponible; se reintentará en la próxima corrida",
  );
  process.exitCode = Math.max(Number(process.exitCode ?? 0), codigoSalida);
  return true;
}

try {
  const cursorResult = await pool.query<{
    valor: string;
    operacion_id: string | null;
  }>(
    `SELECT valor::text AS valor, operacion_id
       FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
  );
  const cursor = cursorResult.rows[0];
  if (!cursor) {
    throw new ErrorSincronizacion(
      1,
      "No existe un punto de partida remoto; ejecuta primero `pnpm run sync:init`.",
    );
  }

  let health: Response;
  try {
    health = await fetch(`${remoteApiUrl}/healthz`, {
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new ErrorSincronizacion(
      1,
      `Render no está disponible; se reintentará en la próxima corrida${
        error instanceof Error ? ` (${error.message})` : ""
      }`,
    );
  }
  if (!health.ok) {
    const decision = clasificarRespuesta(health.status, 0);
    if (decision === "LLAVE_RECHAZADA") {
      throw new ErrorSincronizacion(
        2,
        "Render rechazó la llave de sincronización; revisa SYNC_TOKEN",
      );
    }
    throw new ErrorSincronizacion(
      1,
      "Render no está disponible; se reintentará en la próxima corrida",
    );
  }

  const lock = await pool.query<{ bloqueado: boolean }>(
    "SELECT pg_try_advisory_lock(hashtext('investillo-sync-local')) AS bloqueado",
  );
  if (!lock.rows[0]?.bloqueado) {
    console.log("Ya hay otra sincronización en ejecución; esta se omite.");
    process.exit(0);
  }

  const { rows } = await pool.query<{
    operation_id: string;
    entidad: string;
    entidad_id: string;
    endpoint: string;
    metodo: string;
    payload: unknown;
    creado_en: Date;
    intentos: number;
    referencias_endpoint: unknown;
    referencias_respuesta: unknown;
  }>(
    `SELECT operation_id, entidad, entidad_id, endpoint, metodo, payload, creado_en, intentos, referencias_endpoint, referencias_respuesta
       FROM eventos_sincronizacion
      WHERE estado IN ('pendiente', 'error')
      ORDER BY creado_en ASC
      LIMIT $1`,
    [LIMIT],
  );

  let sincronizadas = 0;
  let fallidas = 0;
  let conflictos = 0;
  async function registrarRespuestaFallida(
    evento: { operation_id: string; intentos: number | string },
    response: Response,
  ): Promise<DecisionRespuesta> {
    const decision = clasificarRespuesta(
      response.status,
      Number(evento.intentos),
    );
    if (detenerPorRespuesta(decision)) return decision;
    const detalle = await response.text().catch(() => "sin detalle");
    const mensaje = `HTTP ${response.status}: ${detalle.slice(0, 500)}`;
    const estado =
      decision === "RECHAZO_DEFINITIVO"
        ? "conflicto"
        : decision === "REINTENTAR"
          ? "pendiente"
          : "error";
    await pool.query(
      `UPDATE eventos_sincronizacion
          SET estado = $2, intentos = intentos + 1, ultimo_error = $3
        WHERE operation_id = $1`,
      [evento.operation_id, estado, mensaje],
    );
    if (decision === "RECHAZO_DEFINITIVO") conflictos++;
    else if (decision === "ERROR") fallidas++;
    return decision;
  }

  for (const evento of rows) {
    try {
      const referencia = await pool.query<{ id_remoto: string }>(
        `SELECT id_remoto FROM referencias_sincronizacion
          WHERE entidad = $1 AND id_local = $2`,
        [evento.entidad, evento.entidad_id],
      );
      const idRemoto = referencia.rows[0]?.id_remoto;
      let endpoint = evento.endpoint;

      if (
        Array.isArray(evento.referencias_endpoint) &&
        evento.referencias_endpoint.length > 0
      ) {
        for (const ref of evento.referencias_endpoint as {
          marcador: string;
          entidad: string;
          valorLocal: string;
        }[]) {
          const refRemota = await pool.query<{ id_remoto: string }>(
            `SELECT id_remoto FROM referencias_sincronizacion WHERE entidad = $1 AND id_local = $2`,
            [ref.entidad, ref.valorLocal],
          );
          const valor = refRemota.rows[0]?.id_remoto;
          if (!valor) {
            throw new Error(
              `Referencia sin resolver: ${ref.entidad} local=${ref.valorLocal}. El padre aún no se ha sincronizado; se reintentará.`,
            );
          }
          endpoint = endpoint.replace(ref.marcador, valor);
        }
        if (idRemoto) endpoint = endpoint.replace("{id}", idRemoto);
        if (endpoint.includes("{")) {
          throw new Error(
            `Endpoint sin resolver por completo: ${endpoint}. Se reintentará.`,
          );
        }
      } else {
        endpoint = idRemoto
          ? evento.endpoint.replaceAll(`/${evento.entidad_id}`, `/${idRemoto}`)
          : evento.endpoint;
      }

      const idsLineasCredito = idsLineaCreditoEnPayload(evento.payload, endpoint);
      const referenciasLineasCredito = idsLineasCredito.length > 0
        ? await pool.query<{ id_local: string; id_remoto: string }>(
            `SELECT id_local, id_remoto FROM referencias_sincronizacion
              WHERE entidad = 'credito_linea' AND id_local = ANY($1::text[])`,
            [idsLineasCredito],
          )
        : { rows: [] };
      const mapaLineasCredito = new Map(
        referenciasLineasCredito.rows.map((row) => [row.id_local, row.id_remoto]),
      );
      if (idsLineasCredito.length > 0) {
        const pendientes = await pool.query<{ id: string }>(
          `SELECT DISTINCT referencia->>'valorLocal' AS id
             FROM eventos_sincronizacion evento,
                  jsonb_array_elements(COALESCE(evento.referencias_respuesta, '[]'::jsonb)) referencia
            WHERE evento.origen = 'local'
              AND evento.estado IN ('pendiente', 'error')
              AND referencia->>'entidad' = 'credito_linea'
              AND referencia->>'valorLocal' = ANY($1::text[])`,
          [idsLineasCredito],
        );
        const pendientesIds = new Set(pendientes.rows.map((row) => row.id));
        const bloqueados = idsLineaPendiente(
          idsLineasCredito,
          mapaLineasCredito,
          pendientesIds,
        );
        if (bloqueados.length > 0) {
          throw new Error(
            `Dependencia pendiente: la(s) línea(s) de crédito ${bloqueados.join(", ")} aún no tiene(n) relación remota; se reintentará(n) después de sincronizar su edición.`,
          );
        }
      }
      const payload = traducirIdsLineaCredito(
        evento.payload,
        endpoint,
        mapaLineasCredito,
      );

      if (["PUT", "PATCH", "DELETE"].includes(evento.metodo)) {
        const urlConflicto = new URL(`${remoteApiUrl}/sync/conflicto`);
        urlConflicto.searchParams.set("desde", cursor.valor);
        if (cursor.operacion_id) {
          urlConflicto.searchParams.set(
            "desdeOperacion",
            cursor.operacion_id,
          );
        }
        urlConflicto.searchParams.set("endpoint", endpoint);
        if (idRemoto) {
          urlConflicto.searchParams.set("entidad", evento.entidad);
          urlConflicto.searchParams.set("entidadId", idRemoto);
        }
        let respuestaConflicto: Response;
        try {
          respuestaConflicto = await fetch(urlConflicto, {
            headers: syncHeaders,
            redirect: "error",
            signal: AbortSignal.timeout(15_000),
          });
        } catch {
          detenerPorRespuesta(clasificarRespuesta(null, 0));
          break;
        }
        if (!respuestaConflicto.ok) {
          const decision = clasificarRespuesta(respuestaConflicto.status, 0);
          if (decision === "LLAVE_RECHAZADA") {
            detenerPorRespuesta(decision);
          } else if (decision === "INTERRUMPIR") {
            detenerPorRespuesta(decision);
          } else {
            console.error(
              "Render no tiene la versión nueva de la API; despliégala primero",
            );
            process.exitCode = Math.max(Number(process.exitCode ?? 0), 1);
          }
          break;
        }
        type ResultadoConflicto = {
          conflicto?: unknown;
          evento?: {
            operationId?: unknown;
            creadoEn?: unknown;
          };
        };
        let resultadoConflicto: ResultadoConflicto | null;
        try {
          resultadoConflicto =
            (await respuestaConflicto.json()) as ResultadoConflicto | null;
        } catch {
          console.error(
            "Render no tiene la versión nueva de la API; despliégala primero",
          );
          process.exitCode = Math.max(Number(process.exitCode ?? 0), 1);
          break;
        }
        if (
          !resultadoConflicto ||
          typeof resultadoConflicto !== "object" ||
          typeof resultadoConflicto.conflicto !== "boolean"
        ) {
          console.error(
            "Render no tiene la versión nueva de la API; despliégala primero",
          );
          process.exitCode = Math.max(Number(process.exitCode ?? 0), 1);
          break;
        }
        if (resultadoConflicto.conflicto) {
          const operationId = resultadoConflicto.evento?.operationId;
          const creadoEn = resultadoConflicto.evento?.creadoEn;
          if (
            typeof operationId !== "string" ||
            typeof creadoEn !== "string"
          ) {
            console.error(
              "Render no tiene la versión nueva de la API; despliégala primero",
            );
            process.exitCode = Math.max(Number(process.exitCode ?? 0), 1);
            break;
          }
          await pool.query(
            `UPDATE eventos_sincronizacion
                SET estado = 'conflicto', intentos = intentos + 1,
                    ultimo_error = $2
              WHERE operation_id = $1`,
            [
              evento.operation_id,
              `Conflicto con el cambio remoto ${String(operationId)} creado en ${String(creadoEn)}`,
            ],
          );
          conflictos++;
          continue;
        }
      }

      let response: Response;
      try {
        response = await fetch(`${remoteApiUrl}${endpoint}`, {
          method: evento.metodo,
          headers: {
            ...syncHeaders,
            "Content-Type": "application/json",
            "X-Operation-Id": evento.operation_id,
            "X-Sync-Apply": "true",
          },
          redirect: "error",
          body: JSON.stringify(payload),
        });
      } catch {
        if (
          detenerPorRespuesta(
            clasificarRespuesta(null, Number(evento.intentos)),
          )
        ) {
          break;
        }
        throw new Error("Falló la comunicación con el servidor remoto");
      }

      if (!response.ok) {
        const decision = await registrarRespuestaFallida(evento, response);
        if (
          decision === "INTERRUMPIR" ||
          decision === "LLAVE_RECHAZADA"
        ) {
          break;
        }
        continue;
      }

      const respuestaRemota = await response.json().catch(() => null);
      let respuestaParaMapear = respuestaRemota;
      if (
        respuestaRemota &&
        typeof respuestaRemota === "object" &&
        (respuestaRemota as { yaProcesado?: boolean }).yaProcesado &&
        Array.isArray(evento.referencias_respuesta) &&
        evento.referencias_respuesta.length > 0
      ) {
        const recursoId = (respuestaRemota as { recursoId?: number | string })
          .recursoId;
        const endpointRecuperacion = endpointDeRecuperacion(
          evento.metodo,
          evento.endpoint,
          endpoint,
          recursoId,
        );
        let recuperada: Response;
        try {
          recuperada = await fetch(
            `${remoteApiUrl}${endpointRecuperacion}`,
            {
              headers: syncHeaders,
              redirect: "error",
              signal: AbortSignal.timeout(15_000),
            },
          );
        } catch {
          detenerPorRespuesta(clasificarRespuesta(null, evento.intentos));
          break;
        }
        if (!recuperada.ok) {
          const decision = await registrarRespuestaFallida(
            evento,
            recuperada,
          );
          if (
            decision === "INTERRUMPIR" ||
            decision === "LLAVE_RECHAZADA"
          ) {
            break;
          }
          continue;
        }
        if (recuperada.ok) respuestaParaMapear = await recuperada.json();
      }
      const idNuevo =
        respuestaParaMapear && typeof respuestaParaMapear === "object"
          ? ((respuestaParaMapear as { _syncNuevoAbonoId?: number | string })
              ._syncNuevoAbonoId ??
            (respuestaParaMapear as { id?: number | string }).id ??
            (respuestaParaMapear as { recursoId?: number | string }).recursoId)
          : undefined;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (idNuevo !== undefined && !idRemoto) {
          await client.query(
            `INSERT INTO referencias_sincronizacion (entidad, id_local, id_remoto)
             VALUES ($1, $2, $3)
             ON CONFLICT (entidad, id_local) DO UPDATE SET id_remoto = EXCLUDED.id_remoto, actualizado_en = now()`,
            [evento.entidad, evento.entidad_id, String(idNuevo)],
          );
        }
        if (
          Array.isArray(evento.referencias_respuesta) &&
          evento.referencias_respuesta.length > 0
        ) {
          const referencias = evento.referencias_respuesta as {
            campo: string;
            entidad: string;
            valorLocal: string;
          }[];
          const relaciones = relacionesDeRespuesta(
            referencias,
            respuestaParaMapear,
            "local",
          );
          for (const relacion of relaciones) {
            await client.query(
              `INSERT INTO referencias_sincronizacion (entidad, id_local, id_remoto)
               VALUES ($1, $2, $3)
               ON CONFLICT (entidad, id_local) DO UPDATE SET id_remoto = EXCLUDED.id_remoto, actualizado_en = now()`,
              [relacion.entidad, relacion.idLocal, relacion.idRemoto],
            );
          }
          for (const referencia of referencias) {
            const guardada = relaciones.some((relacion) =>
              relacion.entidad === referencia.entidad &&
              relacion.idLocal === referencia.valorLocal,
            );
            if (guardada) continue;

            const existente = await client.query(
              `SELECT 1 FROM referencias_sincronizacion
                WHERE entidad = $1 AND id_local = $2`,
              [referencia.entidad, referencia.valorLocal],
            );
            if (existente.rowCount === 0) {
              throw new Error(
                `La respuesta remota no contiene ${referencia.campo} y no existe una relación previa; se reintentará sin marcar el evento como sincronizado.`,
              );
            }
          }
        }
        await client.query(
          `UPDATE eventos_sincronizacion
              SET estado = 'sincronizado', procesado_en = now(), ultimo_error = NULL,
                  respuesta_remota = $2
            WHERE operation_id = $1`,
          [evento.operation_id, JSON.stringify(respuestaRemota)],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch((rollbackError: unknown) => {
          console.error(
            "No se pudo revertir la transacción de sincronización:",
            rollbackError,
          );
        });
        throw error;
      } finally {
        client.release();
      }
      sincronizadas++;
    } catch (error) {
      await pool.query(
        `UPDATE eventos_sincronizacion
            SET estado = 'error', intentos = intentos + 1, ultimo_error = $2
          WHERE operation_id = $1`,
        [
          evento.operation_id,
          error instanceof Error ? error.message : String(error),
        ],
      );
      fallidas++;
    }
  }

  console.log(
    `Sincronización local: ${sincronizadas}/${rows.length} operaciones procesadas.`,
  );
  if (conflictos > 0)
    console.error(
      `${conflictos} conflicto(s) quedaron retenidos sin sobrescribir datos remotos.`,
    );
  if (fallidas > 0) {
    console.error(`${fallidas} operación(es) quedaron con error.`);
  }
  const pendientesEstado = await pool.query<{ cantidad: string }>(
    `SELECT count(*)::text AS cantidad FROM eventos_sincronizacion
      WHERE origen = 'local' AND estado IN ('error', 'conflicto')`,
  );
  if (Number(pendientesEstado.rows[0]?.cantidad ?? 0) > 0) {
    process.exitCode = Math.max(Number(process.exitCode ?? 0), 3);
  }
} catch (error) {
  if (error instanceof ErrorSincronizacion) {
    console.error(error.message);
    process.exitCode = Math.max(
      Number(process.exitCode ?? 0),
      error.codigoSalida,
    );
  } else {
    throw error;
  }
} finally {
  await pool.end();
}
