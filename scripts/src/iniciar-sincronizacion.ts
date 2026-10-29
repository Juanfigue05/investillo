import pg from "pg";
import { getSyncHeaders } from "./sync-auth";
import { getRemoteApiUrl } from "./remote-api-url";

const databaseUrl = process.env.DATABASE_URL;
const remoteApiUrl = getRemoteApiUrl();
if (!databaseUrl) throw new Error("DATABASE_URL es obligatorio");

const syncHeaders = getSyncHeaders();
const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  const existente = await pool.query<{
    valor: string;
    operacion_id: string | null;
  }>(
    `SELECT valor::text AS valor, operacion_id
       FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
  );
  if (existente.rows[0]) {
    console.log(
      `El cursor remoto ya está inicializado en ${existente.rows[0].valor}; no se modificó.`,
    );
  } else {
    const response = await fetch(`${remoteApiUrl}/sync/ahora`, {
      headers: syncHeaders,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(
        `No se pudo obtener el punto de partida remoto: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`,
      );
    }

    const data = (await response.json()) as { ahora?: unknown };
    if (typeof data.ahora !== "string") {
      throw new Error("El API remoto devolvió un punto de partida inválido");
    }

    const guardado = await pool.query<{ valor: string }>(
      `INSERT INTO cursos_sincronizacion (nombre, valor, operacion_id)
       VALUES ('remoto', $1::timestamp, NULL)
       ON CONFLICT (nombre) DO NOTHING
       RETURNING valor::text AS valor`,
      [data.ahora],
    );
    if (guardado.rows[0]) {
      console.log(
        `Punto de partida remoto inicializado en ${guardado.rows[0].valor}.`,
      );
    } else {
      const concurrente = await pool.query<{ valor: string }>(
        `SELECT valor::text AS valor FROM cursos_sincronizacion
          WHERE nombre = 'remoto'`,
      );
      console.log(
        `El cursor remoto ya fue inicializado en ${concurrente.rows[0]?.valor}; no se modificó.`,
      );
    }
  }
} finally {
  await pool.end();
}
