// pg no incluye declaraciones de tipos en esta instalación.
// @ts-expect-error: el módulo se usa correctamente en tiempo de ejecución.
import pg from "pg";
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("Falta DATABASE_URL en el .env");
const DIAS_A_CONSERVAR = 60; // de sobra — nadie reintenta algo offline después de 2 meses

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const res = await pool.query(`DELETE FROM operaciones_sincronizadas WHERE creado_en < now() - interval '${DIAS_A_CONSERVAR} days'`);
  console.log(`🧹 Se limpiaron ${res.rowCount} registro(s) antiguos (más de ${DIAS_A_CONSERVAR} días) de la tabla anti-duplicados.`);
  await pool.end();
}

main().catch((err) => { console.error("Error limpiando:", err); process.exit(1); });