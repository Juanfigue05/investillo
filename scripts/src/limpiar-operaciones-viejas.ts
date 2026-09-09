import pg from "pg";
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("Falta DATABASE_URL en el .env");
const DIAS_A_CONSERVAR = 60; // de sobra — nadie reintenta algo offline después de 2 meses

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const res = await pool.query(`DELETE FROM operaciones_sincronizadas WHERE creado_en < now() - interval '${DIAS_A_CONSERVAR} days'`);
  const eventos = await pool.query(`DELETE FROM eventos_sincronizacion WHERE estado = 'sincronizado' AND procesado_en < now() - interval '${DIAS_A_CONSERVAR} days'`);
  console.log(`Limpieza: ${res.rowCount} operaciones anti-duplicados y ${eventos.rowCount} eventos sincronizados antiguos.`);
  await pool.end();
}

main().catch((err) => { console.error("Error limpiando:", err); process.exit(1); });