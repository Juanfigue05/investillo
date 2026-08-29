import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Sin esto, un corte de internet hace que Node trate el error de conexión
// como no manejado y cierre TODO el proceso — con esto, solo se registra y sigue vivo.
pool.on("error", (err) => {
  console.error("Error en el pool de PostgreSQL (probablemente falta de conexión):", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";