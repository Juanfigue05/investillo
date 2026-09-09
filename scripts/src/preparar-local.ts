import pg from "pg";

const { Client } = pg;
const targetUrl = process.env.DATABASE_URL;

if (!targetUrl) throw new Error("Falta DATABASE_URL en .env.local");

const target = new URL(targetUrl);
const databaseName = decodeURIComponent(target.pathname.replace(/^\//, ""));
if (!databaseName) throw new Error("DATABASE_URL debe incluir el nombre de la base local");

const adminUrl = new URL(targetUrl);
adminUrl.pathname = "/postgres";

const client = new Client({ connectionString: adminUrl.toString() });
try {
  await client.connect();
  const existente = await client.query<{ datname: string }>(
    "SELECT datname FROM pg_database WHERE datname = $1",
    [databaseName],
  );
  if (existente.rowCount === 0) {
    await client.query(`CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`);
    console.log(`Base local creada: ${databaseName}`);
  } else {
    console.log(`La base local ya existe: ${databaseName}`);
  }
} finally {
  await client.end();
}