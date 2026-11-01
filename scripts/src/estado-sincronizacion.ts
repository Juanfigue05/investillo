import pg from "pg";
import { TABLAS_HUELLA } from "@workspace/db/schema";
import { formatearEstadoSincronizacion } from "./lib/estado-sincronizacion";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Falta DATABASE_URL en .env.local");

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  const [cursor, base, eventos, totalEventos] = await Promise.all([
    pool.query<{ valor: string; operacion_id: string | null }>(
      `SELECT to_char(valor, 'YYYY-MM-DD HH24:MI:SS.US') AS valor,
              operacion_id
         FROM cursos_sincronizacion
        WHERE nombre = 'remoto'`,
    ),
    pool.query<{ tabla: string; creado_en: string }>(
      `SELECT tabla, to_char(creado_en, 'YYYY-MM-DD HH24:MI:SS.US') AS creado_en
         FROM base_sincronizacion`,
    ),
    pool.query<{ origen: string; estado: string; cantidad: number }>(
      `SELECT origen, estado, count(*)::int AS cantidad
         FROM eventos_sincronizacion
        GROUP BY origen, estado
        ORDER BY origen, estado`,
    ),
    pool.query<{ cantidad: number }>(
      "SELECT count(*)::int AS cantidad FROM eventos_sincronizacion",
    ),
  ]);
  const fechaBase = base.rows.reduce<string | null>(
    (fechaMasAntigua, fila) =>
      fechaMasAntigua === null || fila.creado_en < fechaMasAntigua
        ? fila.creado_en
        : fechaMasAntigua,
    null,
  );
  const eventosAnteriores =
    fechaBase === null
      ? null
      : (
          await pool.query<{ cantidad: number }>(
            `SELECT count(*)::int AS cantidad
               FROM eventos_sincronizacion
              WHERE creado_en < $1::timestamp`,
            [fechaBase],
          )
        ).rows[0]?.cantidad ?? 0;

  console.log(
    formatearEstadoSincronizacion({
      tablasEsperadas: TABLAS_HUELLA,
      tablasGuardadas: base.rows.map(({ tabla }) => tabla),
      ...(cursor.rows[0]
        ? {
            cursor: {
              valor: cursor.rows[0].valor,
              operacionId: cursor.rows[0].operacion_id,
            },
          }
        : {}),
      eventos: eventos.rows,
      eventosAnteriores,
      totalEventos: totalEventos.rows[0]?.cantidad ?? 0,
    }),
  );
} finally {
  await pool.end();
}
