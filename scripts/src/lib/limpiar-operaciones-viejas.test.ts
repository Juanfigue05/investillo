import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { limpiarEventosSincronizadosAntiguos } from "./limpiar-operaciones-viejas";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("La prueba de limpieza requiere la base local investillo_test");
}
const database = new URL(databaseUrl);
if (
  !new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(database.hostname) ||
  database.pathname !== "/investillo_test"
) {
  throw new Error("Prueba bloqueada: solo se permite la base local investillo_test");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

after(async () => {
  await pool.end();
});

test("limpia eventos api_idempotente sincronizados después de la retención", async () => {
  const client = await pool.connect();
  const viejo = `orden18-cleanup-${randomUUID()}`;
  const reciente = `orden18-cleanup-${randomUUID()}`;
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO eventos_sincronizacion
        (operation_id, entidad, entidad_id, tipo, metodo, endpoint, payload,
         origen, estado, procesado_en)
       VALUES
        ($1, 'api', '/test', 'POST', 'POST', '/test', '{}'::jsonb,
         'api_idempotente', 'sincronizado', now() - interval '61 days'),
        ($2, 'api', '/test', 'POST', 'POST', '/test', '{}'::jsonb,
         'api_idempotente', 'sincronizado', now())`,
      [viejo, reciente],
    );

    const eliminados = await limpiarEventosSincronizadosAntiguos(client, 60);
    const filas = await client.query<{ operation_id: string }>(
      `SELECT operation_id FROM eventos_sincronizacion
        WHERE operation_id = ANY($1::text[])`,
      [[viejo, reciente]],
    );

    assert.ok(eliminados >= 1);
    assert.deepEqual(
      filas.rows.map((fila) => fila.operation_id),
      [reciente],
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
