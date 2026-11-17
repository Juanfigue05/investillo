import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL no está configurada.");
}

const target = new URL(databaseUrl);
if (!target.hostname.toLowerCase().endsWith(".aivencloud.com")) {
  throw new Error("Se detuvo: el destino configurado no es un host Aiven reconocido.");
}

const { Client } = pg;
const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  const { rows: [database] } = await client.query(`
    SELECT
      current_setting('transaction_read_only') AS read_only,
      to_regclass('public.mano_obra') IS NOT NULL AS mano_obra_exists
  `);
  if (database.read_only !== "off") {
    throw new Error("Se detuvo: la conexión está en modo solo lectura.");
  }
  if (!database.mano_obra_exists) {
    throw new Error("Se detuvo: no existe public.mano_obra en el destino.");
  }

  const migration = await readFile(
    join(process.cwd(), "migrations", "20261117_servicios_creditos.sql"),
    "utf8",
  );
  await client.query(migration);

  const { rows: [verification] } = await client.query(`
    SELECT count(*)::int AS count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'mano_obra'
      AND column_name = 'tipo_servicio'
  `);
  if (verification.count !== 1) {
    throw new Error("La verificación posterior no encontró tipo_servicio en public.mano_obra.");
  }

  console.log("Migración aplicada y verificada: tipo_servicio presente en public.mano_obra.");
} finally {
  await client.end();
}
