import pg from "pg";
import { getSyncHeaders } from "./sync-auth";
import { getRemoteApiUrl } from "./remote-api-url";
import {
  idsLineaPendiente,
  idsLineaCreditoEnPayload,
  relacionesDeRespuesta,
  endpointDeRecuperacion,
  resolverEndpointConReferencias,
  traducirIdRecursoEnEndpoint,
  traducirIdsLineaCredito,
} from "./lib/credito-lineas-sync";

const databaseUrl = process.env.DATABASE_URL;
const remoteApiUrl = getRemoteApiUrl();
if (!databaseUrl || !remoteApiUrl)
  throw new Error("DATABASE_URL y SYNC_REMOTE_API_URL son obligatorios");

function obtenerTamanoPagina(): number {
  const configurado = process.env.SYNC_PAGE_SIZE;
  if (configurado === undefined) return 100;
  if (process.env.NODE_ENV !== "test") {
    throw new Error("SYNC_PAGE_SIZE solo se permite en pruebas");
  }
  if (!/^\d+$/.test(configurado)) {
    throw new Error("SYNC_PAGE_SIZE debe ser un entero entre 1 y 200");
  }
  const valor = Number(configurado);
  if (!Number.isSafeInteger(valor) || valor < 1 || valor > 200) {
    throw new Error("SYNC_PAGE_SIZE debe ser un entero entre 1 y 200");
  }
  return valor;
}

const pageSize = obtenerTamanoPagina();
const syncHeaders = getSyncHeaders();
const pool = new pg.Pool({ connectionString: databaseUrl });
const lockClient = await pool.connect();
const lock = await lockClient.query<{ bloqueado: boolean }>(
  "SELECT pg_try_advisory_lock(hashtext('investillo-sync-remoto')) AS bloqueado",
);
if (!lock.rows[0]?.bloqueado) {
  console.log(
    "Ya hay una descarga de cambios remotos en ejecución; esta se omite.",
  );
  lockClient.release();
  await pool.end();
  process.exit(0);
}
try {
  const cursorResult = await pool.query<{
    valor: string;
    operacion_id: string | null;
  }>(
    `SELECT valor::text AS valor, operacion_id
       FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
  );
  const cursorInicial = cursorResult.rows[0];
  if (!cursorInicial) {
    throw new Error(
      "No existe un punto de partida para la descarga remota. Ejecuta primero `pnpm run sync:init`.",
    );
  }

  const pendientes = await pool.query<{ cantidad: string }>(
    `SELECT count(*)::text AS cantidad FROM eventos_sincronizacion
      WHERE estado IN ('pendiente', 'error') AND origen = 'local'`,
  );
  if (Number(pendientes.rows[0]?.cantidad ?? 0) > 0) {
    throw new Error(
      "No se descargan cambios remotos mientras existan operaciones locales pendientes o con error",
    );
  }
  let cursorFecha = cursorInicial.valor;
  let cursorOperacion = cursorInicial.operacion_id;
  let aplicados = 0;
  let huboEventos = false;
  let hayMas = true;
  while (hayMas) {
    const urlPull = new URL(`${remoteApiUrl}/sync/pull`);
    urlPull.searchParams.set("desde", cursorFecha);
    urlPull.searchParams.set("limite", String(pageSize));
    if (cursorOperacion) {
      urlPull.searchParams.set("desdeOperacion", cursorOperacion);
    }
    const response = await fetch(urlPull, {
      headers: syncHeaders,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(
        `Pull remoto HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    }
    const data = (await response.json()) as {
      eventos: Array<{
        operationId: string;
        endpoint: string;
        metodo: string;
        payload: unknown;
        entidad: string;
        entidadId: string;
        referenciasRespuesta: Array<{
          campo: string;
          entidad: string;
          valorLocal: string;
        }> | null;
        referenciasEndpoint: Array<{
          marcador: string;
          entidad: string;
          valorLocal: string;
        }> | null;
        creadoEn: string;
      }>;
      hasta: string;
      hastaOperacion: string | null;
      hayMas: boolean;
    };
    if (!Array.isArray(data.eventos) || typeof data.hayMas !== "boolean") {
      throw new Error(
        "El API remoto devolvió una página de sincronización inválida",
      );
    }
    if (data.eventos.length === 0 && data.hayMas) {
      throw new Error(
        "El API remoto indicó más eventos, pero la página está vacía",
      );
    }
    hayMas = data.hayMas;
    if (data.eventos.length === 0) break;

    const lineasCreditoPendientes = new Set(
      data.eventos.flatMap((evento) =>
        (evento.referenciasRespuesta ?? [])
          .filter((referencia) => referencia.entidad === "credito_linea")
          .map((referencia) => referencia.valorLocal),
      ),
    );

    for (const evento of data.eventos) {
      let endpoint = evento.endpoint;
      if (evento.referenciasEndpoint?.length) {
        const idsDestino = new Map<string, string>();
        for (const referencia of evento.referenciasEndpoint) {
          const relacion = await pool.query<{ id_local: string }>(
            `SELECT id_local FROM referencias_sincronizacion
            WHERE entidad = $1 AND id_remoto = $2`,
            [referencia.entidad, referencia.valorLocal],
          );
          if (relacion.rows[0]) {
            idsDestino.set(
              `${referencia.entidad}:${referencia.valorLocal}`,
              relacion.rows[0].id_local,
            );
          }
        }
        endpoint = resolverEndpointConReferencias(
          endpoint,
          evento.referenciasEndpoint,
          idsDestino,
        );
      }
      if (endpoint.includes("{id}")) {
        const relacion = await pool.query<{ id_local: string }>(
          `SELECT id_local FROM referencias_sincronizacion
          WHERE entidad = $1 AND id_remoto = $2`,
          [evento.entidad, evento.entidadId],
        );
        const idLocal = relacion.rows[0]?.id_local;
        if (!idLocal) {
          throw new Error(
            `No existe mapeo local para ${evento.entidad} remoto=${evento.entidadId}`,
          );
        }
        endpoint = endpoint.replace("{id}", idLocal);
      }
      if (evento.metodo !== "POST" && !endpoint.includes("{")) {
        const relacionRecurso = await pool.query<{ id_local: string }>(
          `SELECT id_local FROM referencias_sincronizacion
          WHERE entidad = $1 AND id_remoto = $2`,
          [evento.entidad, evento.entidadId],
        );
        if (relacionRecurso.rows[0]) {
          endpoint = traducirIdRecursoEnEndpoint(
            endpoint,
            evento.entidadId,
            relacionRecurso.rows[0].id_local,
          );
        }
      }

      const idsLineasCredito = idsLineaCreditoEnPayload(
        evento.payload,
        evento.endpoint,
      );
      const referenciasLineasCredito =
        idsLineasCredito.length > 0
          ? await pool.query<{ id_remoto: string; id_local: string }>(
              `SELECT id_remoto, id_local FROM referencias_sincronizacion
            WHERE entidad = 'credito_linea' AND id_remoto = ANY($1::text[])`,
              [idsLineasCredito],
            )
          : { rows: [] };
      const mapaLineasCredito = new Map(
        referenciasLineasCredito.rows.map((row) => [
          row.id_remoto,
          row.id_local,
        ]),
      );
      const bloqueados = idsLineaPendiente(
        idsLineasCredito,
        mapaLineasCredito,
        lineasCreditoPendientes,
      );
      if (bloqueados.length > 0) {
        throw new Error(
          `Dependencia pendiente: la(s) línea(s) remota(s) ${bloqueados.join(", ")} aún no tiene(n) relación local.`,
        );
      }
      const payload = traducirIdsLineaCredito(
        evento.payload,
        evento.endpoint,
        mapaLineasCredito,
      );

      const applied = await fetch(
        `http://localhost:${process.env.PORT || 8080}/api${endpoint}`,
        {
          method: evento.metodo,
          headers: {
            ...syncHeaders,
            "Content-Type": "application/json",
            "X-Operation-Id": evento.operationId,
            "X-Sync-Apply": "true",
          },
          redirect: "error",
          body: JSON.stringify(payload),
        },
      );
      if (!applied.ok)
        throw new Error(
          `No se pudo aplicar ${evento.metodo} ${endpoint}: HTTP ${applied.status}`,
        );
      const respuestaAplicada = await applied.json().catch(() => null);
      let respuestaLocal = respuestaAplicada;
      if (
        respuestaAplicada &&
        typeof respuestaAplicada === "object" &&
        (respuestaAplicada as { yaProcesado?: boolean }).yaProcesado
      ) {
        const recursoId = (respuestaAplicada as { recursoId?: number | string })
          .recursoId;
        const endpointRecuperacion = endpointDeRecuperacion(
          evento.metodo,
          evento.endpoint,
          endpoint,
          recursoId,
        );
        const recuperada = await fetch(
          `http://localhost:${process.env.PORT || 8080}/api${endpointRecuperacion}`,
          {
            headers: syncHeaders,
            redirect: "error",
            signal: AbortSignal.timeout(15_000),
          },
        );
        if (recuperada.ok) respuestaLocal = await recuperada.json();
      }

      const relaciones = relacionesDeRespuesta(
        evento.referenciasRespuesta ?? [],
        respuestaLocal,
        "remoto",
      );
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (
          evento.metodo === "POST" &&
          evento.entidad !== "api" &&
          respuestaLocal &&
          typeof respuestaLocal === "object"
        ) {
          const respuesta = respuestaLocal as {
            _syncNuevoAbonoId?: number | string;
            id?: number | string;
            recursoId?: number | string;
          };
          const idLocal =
            respuesta._syncNuevoAbonoId ?? respuesta.id ?? respuesta.recursoId;
          if (idLocal !== undefined) {
            await client.query(
              `INSERT INTO referencias_sincronizacion (entidad, id_local, id_remoto)
             VALUES ($1, $2, $3)
             ON CONFLICT (entidad, id_local) DO UPDATE
             SET id_remoto = EXCLUDED.id_remoto, actualizado_en = now()`,
              [evento.entidad, String(idLocal), evento.entidadId],
            );
          }
        }
        for (const relacion of relaciones) {
          await client.query(
            `INSERT INTO referencias_sincronizacion (entidad, id_local, id_remoto)
           VALUES ($1, $2, $3)
           ON CONFLICT (entidad, id_local) DO UPDATE
           SET id_remoto = EXCLUDED.id_remoto, actualizado_en = now()`,
            [relacion.entidad, relacion.idLocal, relacion.idRemoto],
          );
        }
        for (const referencia of evento.referenciasRespuesta ?? []) {
          const guardada = relaciones.some(
            (relacion) =>
              relacion.entidad === referencia.entidad &&
              relacion.idRemoto === referencia.valorLocal,
          );
          if (guardada) continue;

          const existente = await client.query(
            `SELECT 1 FROM referencias_sincronizacion
            WHERE entidad = $1 AND id_remoto = $2`,
            [referencia.entidad, referencia.valorLocal],
          );
          if (existente.rowCount === 0) {
            throw new Error(
              `La respuesta local no contiene ${referencia.campo} y no existe una relación previa; no se avanzará el cursor.`,
            );
          }
        }
        await client.query(
          `INSERT INTO cursos_sincronizacion (nombre, valor, operacion_id)
         VALUES ('remoto', $1::timestamp, $2)
         ON CONFLICT (nombre) DO UPDATE SET
           valor = EXCLUDED.valor,
           operacion_id = EXCLUDED.operacion_id,
           actualizado_en = now()`,
          [evento.creadoEn, evento.operationId],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch((rollbackError: unknown) => {
          console.error(
            "No se pudo revertir la transacción de referencias remotas:",
            rollbackError,
          );
        });
        throw error;
      } finally {
        client.release();
      }
      cursorFecha = evento.creadoEn;
      cursorOperacion = evento.operationId;
      aplicados++;
      huboEventos = true;
    }
  }

  if (huboEventos) {
    const ack = await fetch(`${remoteApiUrl}/sync/ack`, {
      method: "POST",
      headers: {
        ...syncHeaders,
        "Content-Type": "application/json",
        "X-Sync-Apply": "true",
      },
      body: JSON.stringify({ hasta: cursorFecha }),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!ack.ok) {
      throw new Error(
        `No se pudo confirmar el cursor remoto: HTTP ${ack.status} ${(await ack.text()).slice(0, 300)}`,
      );
    }
  }
  console.log(`Sincronización remota → local: ${aplicados} eventos aplicados.`);
} finally {
  try {
    await lockClient.query(
      "SELECT pg_advisory_unlock(hashtext('investillo-sync-remoto'))",
    );
  } finally {
    lockClient.release();
    await pool.end();
  }
}
