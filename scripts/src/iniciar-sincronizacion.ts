import pg from "pg";
import { TABLAS_HUELLA, type TablaHuella } from "@workspace/db/schema";
import { getSyncHeaders } from "./sync-auth";
import { getRemoteApiUrl } from "./remote-api-url";

type Huella = {
  total: number;
  maximoId: number;
};

const databaseUrl = process.env.DATABASE_URL;
const remoteApiUrl = getRemoteApiUrl();
if (!databaseUrl) throw new Error("DATABASE_URL es obligatorio");

const syncHeaders = getSyncHeaders();
const pool = new pg.Pool({ connectionString: databaseUrl });

async function calcularHuellaLocal(
  client: pg.PoolClient,
): Promise<Record<TablaHuella, Huella>> {
  const tablas = {} as Record<TablaHuella, Huella>;
  for (const tabla of TABLAS_HUELLA) {
    const resultado = await client.query<{
      total: string;
      maximoId: string;
    }>(
      `SELECT count(*)::text AS total,
              COALESCE(max(id), 0)::text AS "maximoId"
         FROM "${tabla}"`,
    );
    const fila = resultado.rows[0];
    if (!fila) throw new Error(`No se pudo calcular la huella de ${tabla}`);
    tablas[tabla] = {
      total: Number(fila.total),
      maximoId: Number(fila.maximoId),
    };
  }
  return tablas;
}

function validarHuellaRemota(
  valor: unknown,
): Partial<Record<TablaHuella, Huella>> {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    throw new Error("Render devolvió una huella inválida");
  }
  const datos = (valor as { tablas?: unknown }).tablas;
  if (typeof datos !== "object" || datos === null || Array.isArray(datos)) {
    throw new Error("Render devolvió una huella inválida");
  }

  const tablas: Partial<Record<TablaHuella, Huella>> = {};
  for (const tabla of TABLAS_HUELLA) {
    const medida = (datos as Record<string, unknown>)[tabla];
    if (
      typeof medida !== "object" ||
      medida === null ||
      Array.isArray(medida)
    ) {
      continue;
    }
    const { total, maximoId } = medida as Record<string, unknown>;
    if (
      typeof total !== "number" ||
      !Number.isSafeInteger(total) ||
      total < 0 ||
      typeof maximoId !== "number" ||
      !Number.isSafeInteger(maximoId) ||
      maximoId < 0
    ) {
      continue;
    }
    tablas[tabla] = { total, maximoId };
  }
  return tablas;
}

async function consultarRender<T>(ruta: string): Promise<T> {
  const response = await fetch(`${remoteApiUrl}${ruta}`, {
    headers: syncHeaders,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      `No se pudo consultar ${ruta} en Render: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`,
    );
  }
  return (await response.json()) as T;
}

let client: pg.PoolClient | undefined;
let transaccionAbierta = false;
try {
  client = await pool.connect();
  await client.query("BEGIN");
  transaccionAbierta = true;
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [
    "investillo-sync-init",
  ]);

  const existente = await client.query<{
    valor: string;
    operacion_id: string | null;
  }>(
    `SELECT valor::text AS valor, operacion_id
       FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
  );
  if (existente.rows[0]) {
    await client.query("COMMIT");
    transaccionAbierta = false;
    console.log(
      `El cursor remoto ya está inicializado en ${existente.rows[0].valor}; no se modificó.`,
    );
  } else {
    const huellaLocal = await calcularHuellaLocal(client);
    const huellaRemota = validarHuellaRemota(
      await consultarRender<unknown>("/sync/huella"),
    );
    const diferencias = TABLAS_HUELLA.filter((tabla) => {
      const local = huellaLocal[tabla];
      const remoto = huellaRemota[tabla];
      return (
        remoto === undefined ||
        local.total !== remoto.total ||
        local.maximoId !== remoto.maximoId
      );
    });

    if (diferencias.length > 0) {
      await client.query("ROLLBACK");
      transaccionAbierta = false;
      console.error("Las tablas no coinciden:");
      for (const tabla of diferencias) {
        const local = huellaLocal[tabla];
        const remoto = huellaRemota[tabla];
        console.error(
          `- ${tabla}: local total=${local.total}, maximoId=${local.maximoId}; Render ${
            remoto
              ? `total=${remoto.total}, maximoId=${remoto.maximoId}`
              : "no reportó esta tabla"
          }`,
        );
      }
      console.error(
        "Las bases no están alineadas. Con el sistema en reposo, copia una base sobre la otra y repite sync:init.",
      );
      process.exitCode = 1;
    } else {
      const data = await consultarRender<{ ahora?: unknown }>("/sync/ahora");
      if (typeof data.ahora !== "string") {
        throw new Error("El API remoto devolvió un punto de partida inválido");
      }

      await client.query("DELETE FROM base_sincronizacion");
      await client.query(
        `INSERT INTO cursos_sincronizacion (nombre, valor, operacion_id)
         VALUES ('remoto', $1::timestamp, NULL)`,
        [data.ahora],
      );
      for (const tabla of TABLAS_HUELLA) {
        const { total, maximoId } = huellaLocal[tabla];
        await client.query(
          `INSERT INTO base_sincronizacion (tabla, total, maximo_id)
           VALUES ($1, $2::bigint, $3::bigint)`,
          [tabla, total, maximoId],
        );
      }
      await client.query("COMMIT");
      transaccionAbierta = false;
      console.log(
        `Punto de partida remoto inicializado en ${data.ahora}; se guardó la huella de ${TABLAS_HUELLA.length} tablas.`,
      );
    }
  }
} catch (error) {
  if (transaccionAbierta && client) {
    try {
      await client.query("ROLLBACK");
      transaccionAbierta = false;
    } catch (rollbackError) {
      console.error(
        "No se pudo revertir la transacción de sync:init:",
        rollbackError,
      );
    }
  }
  console.error("No se pudo inicializar la sincronización:", error);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
