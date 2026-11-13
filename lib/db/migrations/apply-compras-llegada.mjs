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

const expectedColumns = [
  "cantidad_local_recibida",
  "cantidad_bodega_recibida",
  "precios_inventario_antes",
  "precios_inventario_aplicados",
  "precios_inventario_actualizados",
];
const { Client } = pg;
const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  const { rows: [database] } = await client.query(`
    SELECT
      current_setting('transaction_read_only') AS read_only,
      to_regclass('public.compras') IS NOT NULL AS compras_exists
  `);
  if (database.read_only !== "off") {
    throw new Error("Se detuvo: la conexión está en modo solo lectura.");
  }
  if (!database.compras_exists) {
    throw new Error("Se detuvo: no existe public.compras en el destino.");
  }

  const migration = await readFile(
    join(process.cwd(), "migrations", "20261113_compras_llegada.sql"),
    "utf8",
  );
  await client.query(migration);

  const { rows: [verification] } = await client.query(
    `
      SELECT count(*)::int AS count
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'compras'
        AND column_name = ANY($1)
    `,
    [expectedColumns],
  );
  if (verification.count !== expectedColumns.length) {
    throw new Error("La verificación posterior no encontró todas las columnas esperadas.");
  }

  console.log("Migración aplicada y verificada: 5 columnas presentes en public.compras.");
} finally {
  await client.end();
}
