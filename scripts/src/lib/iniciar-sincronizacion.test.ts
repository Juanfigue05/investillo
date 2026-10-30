import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import test from "node:test";
import { TABLAS_HUELLA, type TablaHuella } from "@workspace/db/schema";

const databaseUrl = process.env.SYNC_TEST_DATABASE_LOCAL;
if (!databaseUrl) {
  throw new Error(
    "Define SYNC_TEST_DATABASE_LOCAL con la URL de investillo_sync_local",
  );
}
const database = new URL(databaseUrl);
if (
  !["localhost", "127.0.0.1", "::1", "[::1]"].includes(database.hostname) ||
  database.pathname !== "/investillo_sync_local"
) {
  throw new Error(
    "Prueba bloqueada: SYNC_TEST_DATABASE_LOCAL debe ser la base local investillo_sync_local",
  );
}

const { Pool } = pg;
const pool = new Pool({ connectionString: databaseUrl });
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const scriptsRoot = join(repoRoot, "scripts");
const token = randomBytes(32).toString("hex");
const operationId = randomUUID();
const ahora = "2026-10-29 12:00:00.000000";
type Huella = { total: number; maximoId: number };
type Baseline = {
  tabla: string;
  total: string;
  maximo_id: string;
  creado_en: Date;
};
type Cursor = {
  nombre: string;
  valor: Date;
  operacion_id: string | null;
  actualizado_en: Date;
};

let modoHuella: "normal" | "total" | "maximo" | "faltante" | "invalida" =
  "normal";
let errorHuella = false;
let llamadasHuella = 0;
let llamadasAhora = 0;
let port = 0;

const server = createServer((request, response) => {
  response.setHeader("Content-Type", "application/json");
  const path = new URL(request.url ?? "/", `http://127.0.0.1:${port}`).pathname;
  if (path === "/api/sync/huella") {
    llamadasHuella++;
    if (errorHuella) {
      response
        .writeHead(500)
        .end(JSON.stringify({ error: "Fallo intencional" }));
      return;
    }
    void calcularHuellaLocal().then((tablas) => {
      if (modoHuella === "total") {
        const tablaTotal = TABLAS_HUELLA[0];
        if (tablaTotal) tablas[tablaTotal]!.total++;
      } else if (modoHuella === "maximo") {
        const tablaMaximo = TABLAS_HUELLA[1];
        if (tablaMaximo) tablas[tablaMaximo]!.maximoId++;
      } else if (modoHuella === "faltante") {
        Reflect.deleteProperty(tablas, TABLAS_HUELLA[0]);
      } else if (modoHuella === "invalida") {
        Reflect.set(tablas, TABLAS_HUELLA[0], {
          total: -1,
          maximoId: 0,
        });
      }
      response.writeHead(200).end(JSON.stringify({ tablas }));
    });
    return;
  }
  if (path === "/api/sync/ahora") {
    llamadasAhora++;
    response.writeHead(200).end(JSON.stringify({ ahora }));
    return;
  }
  response.writeHead(404).end(JSON.stringify({ error: "No encontrado" }));
});

async function calcularHuellaLocal(): Promise<Record<TablaHuella, Huella>> {
  const tablas = {} as Record<TablaHuella, Huella>;
  for (const tabla of TABLAS_HUELLA) {
    const resultado = await pool.query<{
      total: string;
      maximo_id: string;
    }>(
      `SELECT count(*)::text AS total,
              COALESCE(max(id), 0)::text AS maximo_id
         FROM "${tabla}"`,
    );
    tablas[tabla] = {
      total: Number(resultado.rows[0]?.total),
      maximoId: Number(resultado.rows[0]?.maximo_id),
    };
  }
  return tablas;
}

function ejecutarScript(): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", join("src", "iniciar-sincronizacion.ts")],
      {
        cwd: scriptsRoot,
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          TEMP: process.env.TEMP,
          TMP: process.env.TMP,
          USERPROFILE: process.env.USERPROFILE,
          NODE_ENV: "test",
          DATABASE_URL: databaseUrl,
          SYNC_REMOTE_API_URL: `http://127.0.0.1:${port}/api`,
          SYNC_TEST_ALLOW_LOCAL_HTTP: "true",
          SYNC_TOKEN: token,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
    setTimeout(() => child.kill(), 60_000).unref();
  });
}

async function limpiarEstado(): Promise<void> {
  await pool.query("DELETE FROM cursos_sincronizacion WHERE nombre = 'remoto'");
  await pool.query("DELETE FROM base_sincronizacion");
}

test(
  "sync:init valida y guarda atómicamente la huella inicial",
  { timeout: 90_000 },
  async () => {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS base_sincronizacion (
      tabla text PRIMARY KEY,
      total bigint NOT NULL,
      maximo_id bigint NOT NULL,
      creado_en timestamp NOT NULL DEFAULT now()
    )
  `);
    const cursorGuardado = await pool.query<Cursor>(
      `SELECT nombre, valor, operacion_id, actualizado_en
       FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
    );
    const baseGuardada = await pool.query<Baseline>(
      `SELECT tabla, total::text, maximo_id::text, creado_en
       FROM base_sincronizacion ORDER BY tabla`,
    );

    await new Promise<void>((resolveListen, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolveListen);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    port = address.port;

    let restriccionCreada = false;
    const restriccion = `sync_init_falla_${operationId.replaceAll("-", "")}`;
    try {
      await limpiarEstado();
      modoHuella = "normal";
      errorHuella = false;
      llamadasHuella = 0;
      llamadasAhora = 0;

      await pool.query(
        `INSERT INTO cursos_sincronizacion (nombre, valor, operacion_id)
         VALUES ('remoto', '1969-12-31 19:00:00'::timestamp, NULL)`,
      );
      const cursorLegado = await ejecutarScript();
      const salidaCursorLegado =
        `${cursorLegado.stdout}\n${cursorLegado.stderr}`;
      assert.equal(cursorLegado.status, 1, salidaCursorLegado);
      assert.match(
        salidaCursorLegado,
        /cursor de una instalación anterior sin punto de partida/i,
      );
      assert.match(
        salidaCursorLegado,
        /debe reiniciarse el estado de sincronización.*readme/i,
      );
      assert.equal(llamadasHuella, 0);
      assert.equal(llamadasAhora, 0);
      assert.equal(
        (
          await pool.query(
            "SELECT 1 FROM cursos_sincronizacion WHERE nombre = 'remoto'",
          )
        ).rowCount,
        1,
      );
      assert.equal((await pool.query("SELECT 1 FROM base_sincronizacion")).rowCount, 0);

      const tablaParcial = TABLAS_HUELLA[0];
      const tablaFaltante = TABLAS_HUELLA[1];
      assert.ok(tablaParcial);
      assert.ok(tablaFaltante);
      await pool.query(
        `INSERT INTO base_sincronizacion (tabla, total, maximo_id)
         VALUES ($1, 0, 0)`,
        [tablaParcial],
      );
      const cursorConBaseIncompleta = await ejecutarScript();
      const salidaBaseIncompleta =
        `${cursorConBaseIncompleta.stdout}\n${cursorConBaseIncompleta.stderr}`;
      assert.equal(cursorConBaseIncompleta.status, 1, salidaBaseIncompleta);
      assert.match(
        salidaBaseIncompleta,
        /cursor de una instalación anterior sin punto de partida/i,
      );
      assert.match(salidaBaseIncompleta, new RegExp(tablaFaltante));
      assert.equal(llamadasHuella, 0);
      assert.equal(llamadasAhora, 0);
      assert.equal(
        (await pool.query("SELECT count(*)::int AS n FROM base_sincronizacion"))
          .rows[0]?.n,
        1,
      );

      await pool.query("DELETE FROM base_sincronizacion");
      for (const tabla of TABLAS_HUELLA) {
        await pool.query(
          `INSERT INTO base_sincronizacion (tabla, total, maximo_id)
           VALUES ($1, 0, 0)`,
          [tabla],
        );
      }
      const cursorConBaseCompleta = await pool.query<Cursor>(
        `SELECT nombre, valor, operacion_id, actualizado_en
           FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
      );
      llamadasHuella = 0;
      llamadasAhora = 0;
      const cursorCompleto = await ejecutarScript();
      assert.equal(cursorCompleto.status, 0, cursorCompleto.stderr || cursorCompleto.stdout);
      assert.equal(llamadasHuella, 0);
      assert.equal(llamadasAhora, 0);
      assert.deepEqual(
        (
          await pool.query<Cursor>(
            `SELECT nombre, valor, operacion_id, actualizado_en
               FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
          )
        ).rows,
        cursorConBaseCompleta.rows,
      );
      assert.equal(
        (
          await pool.query("SELECT count(*)::int AS n FROM base_sincronizacion")
        ).rows[0]?.n,
        TABLAS_HUELLA.length,
      );

      await limpiarEstado();
      llamadasHuella = 0;
      llamadasAhora = 0;

      const inicializa = await ejecutarScript();
      assert.equal(
        inicializa.status,
        0,
        inicializa.stderr || inicializa.stdout,
      );
      const cursorInicial = await pool.query(
        `SELECT to_char(valor, 'YYYY-MM-DD HH24:MI:SS.US') AS valor, operacion_id
         FROM cursos_sincronizacion
        WHERE nombre = 'remoto'`,
      );
      assert.equal(cursorInicial.rowCount, 1);
      assert.equal(cursorInicial.rows[0]?.operacion_id, null);
      assert.equal(cursorInicial.rows[0]?.valor, ahora);
      const huellaLocal = await calcularHuellaLocal();
      const baseInicial = await pool.query<{
        tabla: string;
        total: string;
        maximo_id: string;
      }>(
        `SELECT tabla, total::text, maximo_id::text
         FROM base_sincronizacion ORDER BY tabla`,
      );
      assert.equal(baseInicial.rowCount, TABLAS_HUELLA.length);
      assert.deepEqual(
        baseInicial.rows.map(({ tabla, total, maximo_id }) => [
          tabla,
          Number(total),
          Number(maximo_id),
        ]),
        TABLAS_HUELLA.map((tabla) => [
          tabla,
          huellaLocal[tabla].total,
          huellaLocal[tabla].maximoId,
        ]).sort(([a], [b]) => String(a).localeCompare(String(b))),
      );
      assert.equal(llamadasHuella, 1);
      assert.equal(llamadasAhora, 1);

      const baseAntesDeRepetir = await pool.query<Baseline>(
        `SELECT tabla, total::text, maximo_id::text, creado_en
         FROM base_sincronizacion ORDER BY tabla`,
      );
      const cursorAntesDeRepetir = await pool.query<Cursor>(
        `SELECT nombre, valor, operacion_id, actualizado_en
         FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
      );
      llamadasHuella = 0;
      llamadasAhora = 0;
      errorHuella = true;
      const repetido = await ejecutarScript();
      assert.equal(repetido.status, 0, repetido.stderr || repetido.stdout);
      assert.equal(llamadasHuella, 0);
      assert.equal(llamadasAhora, 0);
      assert.deepEqual(
        (
          await pool.query<Baseline>(
            `SELECT tabla, total::text, maximo_id::text, creado_en
           FROM base_sincronizacion ORDER BY tabla`,
          )
        ).rows,
        baseAntesDeRepetir.rows,
      );
      assert.deepEqual(
        (
          await pool.query<Cursor>(
            `SELECT nombre, valor, operacion_id, actualizado_en
           FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
          )
        ).rows,
        cursorAntesDeRepetir.rows,
      );

      for (const [modo, tablaDiferente] of [
        ["total", TABLAS_HUELLA[0]],
        ["maximo", TABLAS_HUELLA[1]],
      ] as const) {
        await limpiarEstado();
        errorHuella = false;
        modoHuella = modo;
        llamadasHuella = 0;
        const desalineado = await ejecutarScript();
        const salida = `${desalineado.stdout}\n${desalineado.stderr}`;
        assert.equal(desalineado.status, 1, salida);
        assert.match(
          salida,
          /Las bases no están alineadas\. Con el sistema en reposo, copia una base sobre la otra y repite sync:init\./,
        );
        assert.ok(tablaDiferente);
        assert.match(salida, new RegExp(`${tablaDiferente}: local total=`));
        assert.equal(llamadasHuella, 1);
        assert.equal(
          (
            await pool.query(
              `SELECT 1 FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
            )
          ).rowCount,
          0,
        );
        assert.equal(
          (await pool.query("SELECT 1 FROM base_sincronizacion")).rowCount,
          0,
        );
      }

      for (const modo of ["faltante", "invalida"] as const) {
        await limpiarEstado();
        modoHuella = modo;
        llamadasHuella = 0;
        llamadasAhora = 0;
        const respuestaIncompleta = await ejecutarScript();
        const salida = `${respuestaIncompleta.stdout}\n${respuestaIncompleta.stderr}`;
        assert.equal(respuestaIncompleta.status, 1, salida);
        assert.match(salida, /Las bases no están alineadas/);
        assert.match(
          salida,
          new RegExp(
            `${TABLAS_HUELLA[0]}: local total=.*Render no reportó esta tabla`,
          ),
        );
        assert.equal(llamadasHuella, 1);
        assert.equal(llamadasAhora, 0);
        assert.equal(
          (
            await pool.query(
              `SELECT 1 FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
            )
          ).rowCount,
          0,
        );
        assert.equal(
          (await pool.query("SELECT 1 FROM base_sincronizacion")).rowCount,
          0,
        );
      }

      await limpiarEstado();
      modoHuella = "normal";
      llamadasHuella = 0;
      await pool.query(
        `ALTER TABLE base_sincronizacion
         ADD CONSTRAINT "${restriccion}"
         CHECK (tabla <> 'ventas_diarias')`,
      );
      restriccionCreada = true;
      const insercionFallida = await ejecutarScript();
      assert.equal(insercionFallida.status, 1);
      assert.equal(
        (
          await pool.query(
            `SELECT 1 FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
          )
        ).rowCount,
        0,
      );
      assert.equal(
        (await pool.query("SELECT 1 FROM base_sincronizacion")).rowCount,
        0,
      );
      assert.equal(llamadasHuella, 1);
    } finally {
      if (restriccionCreada) {
        await pool.query(
          `ALTER TABLE base_sincronizacion DROP CONSTRAINT "${restriccion}"`,
        );
      }
      await limpiarEstado();
      if (cursorGuardado.rows[0]) {
        const cursor = cursorGuardado.rows[0];
        await pool.query(
          `INSERT INTO cursos_sincronizacion
           (nombre, valor, operacion_id, actualizado_en)
         VALUES ($1, $2, $3, $4)`,
          [
            cursor.nombre,
            cursor.valor,
            cursor.operacion_id,
            cursor.actualizado_en,
          ],
        );
      }
      for (const baseline of baseGuardada.rows) {
        await pool.query(
          `INSERT INTO base_sincronizacion (tabla, total, maximo_id, creado_en)
         VALUES ($1, $2::bigint, $3::bigint, $4)`,
          [
            baseline.tabla,
            baseline.total,
            baseline.maximo_id,
            baseline.creado_en,
          ],
        );
      }
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
      await pool.end();
    }
  },
);
