import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Falta DATABASE_URL en .env.local");

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  const { rows } = await pool.query<{ estado: string; cantidad: string }>(
    `SELECT estado, count(*)::text AS cantidad
       FROM eventos_sincronizacion
      GROUP BY estado
      ORDER BY estado`,
  );
  const estados = Object.fromEntries(rows.map((row) => [row.estado, Number(row.cantidad)]));
  console.log(`Pendientes: ${estados.pendiente ?? 0}`);
  console.log(`Con error: ${estados.error ?? 0}`);
  console.log(`Sincronizadas retenidas: ${estados.sincronizado ?? 0}`);
} finally {
  await pool.end();
}