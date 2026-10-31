import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Client } from "pg";
import test from "node:test";

const localUrl = process.env.SYNC_TEST_DATABASE_LOCAL;
if (!localUrl) {
  throw new Error("Define SYNC_TEST_DATABASE_LOCAL con una base PostgreSQL local aislada");
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationPath = join(
  repoRoot,
  "docs",
  "sql",
  "orden-12-llaves-foraneas-e-indices.sql",
);
const foreignKeys = [
  ["abonos_creditos_credito_id_fk", "abonos_creditos"],
  ["credito_lineas_credito_id_fk", "credito_lineas"],
  ["credito_lineas_producto_id_fk", "credito_lineas"],
  ["compras_producto_id_fk", "compras"],
  ["descuentos_inventario_producto_id_fk", "descuentos_inventario"],
  ["distribuciones_mano_obra_mano_obra_fk", "distribuciones_mano_obra"],
  ["distribuciones_mano_obra_trabajador_fk", "distribuciones_mano_obra"],
  ["historial_precios_compra_id_fk", "historial_precios"],
  ["historial_precios_producto_id_fk", "historial_precios"],
  ["mano_obra_credito_id_fk", "mano_obra"],
  ["mano_obra_venta_id_fk", "mano_obra"],
  ["obra_electronica_trabajador_id_fk", "obra_electronica"],
  ["pagos_seguro_trabajador_id_fk", "pagos_seguro"],
  ["vehiculos_cliente_cliente_id_fk", "vehiculos_cliente"],
  ["ventas_diarias_credito_abono_id_fk", "ventas_diarias"],
  ["ventas_diarias_mano_obra_id_fk", "ventas_diarias"],
  ["ventas_diarias_producto_id_fk", "ventas_diarias"],
] as const;
const indexes = [
  "ventas_diarias_fecha_idx",
  "ventas_diarias_credito_abono_id_idx",
  "ventas_diarias_producto_id_idx",
  "ventas_diarias_mano_obra_id_idx",
  "abonos_creditos_credito_id_idx",
  "credito_lineas_credito_id_idx",
  "credito_lineas_producto_id_idx",
  "creditos_tipo_idx",
  "compras_producto_id_idx",
  "distribuciones_mano_obra_mo_idx",
  "distribuciones_mano_obra_trab_idx",
  "mano_obra_credito_id_idx",
  "mano_obra_venta_id_idx",
  "mano_obra_fecha_idx",
  "historial_precios_producto_id_idx",
  "obra_electronica_trabajador_id_idx",
  "pagos_seguro_trabajador_id_idx",
  "vehiculos_cliente_cliente_id_idx",
] as const;

function assertLoopbackUrl(databaseUrl: string): URL {
  const parsed = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname)) {
    throw new Error("Prueba de esquema bloqueada: solo se permiten bases PostgreSQL loopback");
  }
  return parsed;
}

function connectionUrl(databaseName: string): string {
  const parsed = assertLoopbackUrl(localUrl!);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

async function connect(databaseUrl: string): Promise<Client> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

function pushSchema(databaseUrl: string): void {
  const command = process.env.ComSpec ?? "cmd.exe";
  const result = spawnSync(
    command,
    ["/d", "/s", "/c", "pnpm exec drizzle-kit push --config ./drizzle.config.ts"],
    {
      cwd: join(repoRoot, "lib", "db"),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: "utf8",
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `db:push falló en una base temporal (código ${String(result.status)}): ${result.error?.message ?? "revisa el log de drizzle-kit"}`,
    );
  }
}

async function createDatabase(client: Client, name: string): Promise<void> {
  await client.query(`CREATE DATABASE "${name}"`);
}

async function dropDatabase(client: Client, name: string): Promise<void> {
  await client.query(`DROP DATABASE IF EXISTS "${name}"`);
}

async function removeOrder12Objects(client: Client): Promise<void> {
  for (const [name, table] of foreignKeys) {
    await client.query(
      `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${name}"`,
    );
  }
  for (const name of indexes) {
    await client.query(`DROP INDEX IF EXISTS "${name}"`);
  }
}

async function metadata(client: Client) {
  const constraints = await client.query(
    `SELECT conname AS name, conrelid::regclass::text AS table_name,
            pg_get_constraintdef(oid, true) AS definition
       FROM pg_constraint
      WHERE contype = 'f' AND conname = ANY($1::text[])
      ORDER BY conname`,
    [foreignKeys.map(([name]) => name)],
  );
  const indexRows = await client.query(
    `SELECT tablename AS table_name, indexname AS name, indexdef AS definition
       FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ANY($1::text[])
      ORDER BY indexname`,
    [indexes],
  );
  return { constraints: constraints.rows, indexes: indexRows.rows };
}

async function dataSnapshot(client: Client) {
  const result = await client.query(
    `SELECT
       (SELECT count(*)::int FROM historial_precios) AS historial,
       (SELECT count(*)::int FROM mano_obra) AS mano_obra,
       (SELECT count(*)::int FROM _respaldo_huerfanos) AS respaldo`,
  );
  const origins = await client.query(
    `SELECT origen, count(*)::int AS filas
       FROM _respaldo_huerfanos
      GROUP BY origen ORDER BY origen`,
  );
  return { counts: result.rows[0], origins: origins.rows };
}

async function seedOrphans(client: Client): Promise<void> {
  const codigo = `ORDEN12-${randomUUID()}`;
  const product = await client.query<{ id: number }>(
    `INSERT INTO productos (
       nombre, codigo, precio_compra, precio_venta_sin_iva, precio_venta_con_iva
     ) VALUES ('Producto test Orden 12', $1, 100, 200, 238)
     RETURNING id`,
    [codigo],
  );
  const productId = product.rows[0]!.id;
  for (const [orphanProduct, orphanPurchase] of [
    [productId, 2000000001],
    [2000000002, null],
    [productId, 2000000003],
  ] as const) {
    await client.query(
      `INSERT INTO historial_precios (
         producto_id, producto_nombre, precio_compra, precio_venta, fecha, compra_id
       ) VALUES ($1, 'Historial test Orden 12', 100, 200, '2026-10-30', $2)`,
      [orphanProduct, orphanPurchase],
    );
  }
  await client.query(
    `INSERT INTO mano_obra (fecha, descripcion, valor_total, venta_id)
     VALUES ('2026-10-30', 'Mano de obra test Orden 12', 100, 2000000004)`,
  );
}

test("el SQL de Orden 12 equivale al esquema Drizzle y se puede repetir sin cambios", async () => {
  const adminUrl = assertLoopbackUrl(localUrl!);
  const admin = await connect(adminUrl.toString());
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const directDatabase = `o12_direct_${suffix}`;
  const migrationDatabase = `o12_sql_${suffix}`;
  const created: string[] = [];
  const connections: Client[] = [];

  try {
    const adminInfo = await admin.query<{ superuser: boolean }>(
      `SELECT rolsuper AS superuser
         FROM pg_roles WHERE rolname = current_user`,
    );
    assert.equal(
      adminInfo.rows[0]?.superuser,
      true,
      "La prueba crea bases temporales y requiere un rol local superusuario",
    );
    await createDatabase(admin, directDatabase);
    created.push(directDatabase);
    await createDatabase(admin, migrationDatabase);
    created.push(migrationDatabase);
    pushSchema(connectionUrl(directDatabase));
    pushSchema(connectionUrl(migrationDatabase));

    const direct = await connect(connectionUrl(directDatabase));
    connections.push(direct);
    const migrated = await connect(connectionUrl(migrationDatabase));
    connections.push(migrated);
    await removeOrder12Objects(migrated);
    await seedOrphans(migrated);
    const migration = await readFile(migrationPath, "utf8");
    const started = performance.now();
    await migrated.query(migration);
    const elapsedMs = performance.now() - started;
    const afterFirst = await dataSnapshot(migrated);
    assert.deepEqual(afterFirst.counts, {
      historial: 2,
      mano_obra: 1,
      respaldo: 4,
    });
    assert.deepEqual(afterFirst.origins, [
      { origen: "historial_precios.compra_id", filas: 2 },
      { origen: "historial_precios.producto_id", filas: 1 },
      { origen: "mano_obra.venta_id", filas: 1 },
    ]);

    const metadataDirect = await metadata(direct);
    const metadataMigrated = await metadata(migrated);
    assert.equal(metadataDirect.constraints.length, foreignKeys.length);
    assert.equal(metadataDirect.indexes.length, indexes.length);
    assert.deepEqual(metadataMigrated, metadataDirect);

    const beforeRetry = await dataSnapshot(migrated);
    await migrated.query(migration);
    assert.deepEqual(await dataSnapshot(migrated), beforeRetry);
    assert.deepEqual(await metadata(migrated), metadataDirect);
    console.log(
      `Orden 12 local temporal: 3 historiales antes, 2 después; 1 mano_obra sin cambios; respaldo 2/1/1 por origen; SQL ${elapsedMs.toFixed(1)} ms.`,
    );
  } finally {
    try {
      await Promise.all(connections.map((connection) => connection.end()));
    } finally {
      try {
        for (const name of created.reverse()) {
          await dropDatabase(admin, name);
        }
      } finally {
        await admin.end();
      }
    }
  }
});
