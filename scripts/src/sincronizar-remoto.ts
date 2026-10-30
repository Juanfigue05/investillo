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
import { verificarPuntoPartida } from "./lib/punto-partida";
import { ENTIDAD_TABLA, encontrarRegla, extraerReferencias, resolverEndpoint, traducirPayload } from "./lib/referencias-payload";
import {
  clasificarReferenciaRemota,
  mensajeErrorEquivalencia,
} from "./lib/clasificar-referencia";
import { TABLAS_HUELLA } from "@workspace/db/schema";

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
  await verificarPuntoPartida(pool);
  const baseInicial = await pool.query<{
    tabla: string;
    maximo_id: string;
  }>("SELECT tabla, maximo_id::text FROM base_sincronizacion");
  const maximosIniciales = new Map(
    baseInicial.rows.map((fila) => [fila.tabla, fila.maximo_id]),
  );
  if (TABLAS_HUELLA.some((tabla) => !maximosIniciales.has(tabla))) {
    throw new Error(
      "Falta el punto de partida completo para traducir referencias; ejecuta `pnpm run sync:init` con las dos bases alineadas.",
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
    const creadoresDePagina = new Map<string, number[]>();
    for (const [indiceEvento, evento] of data.eventos.entries()) {
      const referenciasCreadas = [
        ...(evento.metodo === "POST"
          ? [{ entidad: evento.entidad, valor: evento.entidadId }]
          : []),
        ...(evento.referenciasRespuesta ?? []).map((referencia) => ({
          entidad: referencia.entidad,
          valor: referencia.valorLocal,
        })),
      ];
      for (const referencia of referenciasCreadas) {
        const clave = `${referencia.entidad}:${referencia.valor}`;
        const indices = creadoresDePagina.get(clave) ?? [];
        indices.push(indiceEvento);
        creadoresDePagina.set(clave, indices);
      }
    }

    for (const [indiceEvento, evento] of data.eventos.entries()) {
      let endpoint = evento.endpoint;
      const regla = encontrarRegla(evento.metodo, endpoint);
      if (!regla) {
        throw new Error(
          `No existe regla de referencias para ${evento.metodo} ${endpoint}`,
        );
      }
      const referencias = extraerReferencias(regla, evento.payload).filter(
        (referencia) => referencia.entidad !== "credito_linea",
      );
      const ruta = endpoint.split("?", 1)[0] ?? endpoint;
      const segmentosRegla = regla.endpoint.split("/");
      const segmentosRuta = ruta.split("/");
      const creadoresPendientes = new Set<string>();
      for (const [clave, indices] of creadoresDePagina) {
        if (indices.some((indiceCreador) => indiceCreador > indiceEvento)) {
          creadoresPendientes.add(clave);
        }
      }
      const referenciasEndpoint = evento.referenciasEndpoint ?? [];
      const referenciasAResolver = [
        ...referencias.map((referencia) => ({
          referencia,
          destino: "payload" as const,
        })),
        ...(regla.segmentos ?? []).flatMap((segmento) => {
          const indice = segmentosRegla.indexOf(`:${segmento.parametro}`);
          const valor = segmentosRuta[indice];
          return indice >= 0 && valor && !valor.startsWith("{")
            ? [{
                referencia: { entidad: segmento.entidad, valorLocal: valor },
                destino: "segmento" as const,
                indice,
              }]
            : [];
        }),
        ...referenciasEndpoint.map((referencia) => ({
          referencia: {
            entidad: referencia.entidad,
            valorLocal: referencia.valorLocal,
          },
          destino: "padre" as const,
          marcador: referencia.marcador,
          indice: segmentosRegla.indexOf(
            `:${referencia.marcador.slice(1, -1)}`,
          ),
        })),
        ...((segmentosRegla.includes(":id") || endpoint.includes("{id}"))
          ? [{
              referencia: {
                entidad: evento.entidad,
                valorLocal: evento.entidadId,
              },
              destino: "propia" as const,
              indice: segmentosRegla.indexOf(":id"),
              ...(endpoint.includes("{id}") ? { marcador: "{id}" } : {}),
            }]
          : []),
      ];
      const mapaReferencias = new Map<string, string>();
      const reemplazosEndpoint = new Map<string, {
        valorRemoto: string;
        valorLocal: string;
        indice: number;
      }>();
      const resultadosReferencias = new Map<
        string,
        Awaited<ReturnType<typeof clasificarReferenciaRemota>>
      >();
      for (const elemento of referenciasAResolver) {
        const clave = `${elemento.referencia.entidad}:${elemento.referencia.valorLocal}`;
        let resultado = resultadosReferencias.get(clave);
        if (!resultado) {
          resultado = await clasificarReferenciaRemota(
            pool,
            elemento.referencia,
            maximosIniciales,
            ENTIDAD_TABLA,
            creadoresPendientes,
          );
          resultadosReferencias.set(clave, resultado);
        }
        if (resultado.tipo === "espera") {
          throw new Error(
            `Espera la creación remota de ${elemento.referencia.entidad} ${elemento.referencia.valorLocal}; el cursor se detuvo antes de aplicar el evento.`,
          );
        }
        if (resultado.tipo === "conflicto") {
          throw new Error(
            `Referencia sin equivalente local: ${elemento.referencia.entidad} ${elemento.referencia.valorLocal}`,
          );
        }
        const valorLocal =
          resultado.tipo === "traducida"
            ? resultado.valorRemoto
            : elemento.referencia.valorLocal;
        mapaReferencias.set(clave, valorLocal);
        if (elemento.destino !== "payload") {
          const segmentoOriginal = elemento.destino === "padre"
            ? (segmentosRuta[elemento.indice]?.startsWith("{")
                ? elemento.marcador
                : segmentosRuta[elemento.indice] ?? elemento.marcador)
            : elemento.destino === "propia" && elemento.marcador
              ? elemento.marcador
              : elemento.referencia.valorLocal;
          reemplazosEndpoint.set(
            `${segmentoOriginal}:${elemento.indice}`,
            {
              valorRemoto: segmentoOriginal,
              valorLocal,
              indice: elemento.indice,
            },
          );
        }
      }
      for (const reemplazo of reemplazosEndpoint.values()) {
        endpoint = resolverEndpoint(
          endpoint,
          reemplazo.valorRemoto,
          reemplazo.valorLocal,
          reemplazo.indice,
        ).endpoint;
      }
      if (endpoint.includes("{")) {
        throw new Error(`Endpoint sin resolver por completo: ${endpoint}`);
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
      const payloadTraducido = traducirPayload(
        {
          ...regla,
          campos: regla.campos.filter(
            (campo) => campo.entidad !== "credito_linea",
          ),
        },
        evento.payload,
        mapaReferencias,
      );
      const payload = traducirIdsLineaCredito(
        payloadTraducido,
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
        throw new Error(
          mensajeErrorEquivalencia(error) ??
            (error instanceof Error ? error.message : String(error)),
        );
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
