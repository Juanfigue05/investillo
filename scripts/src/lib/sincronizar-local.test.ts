import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import test from "node:test";

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
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const scriptsRoot = join(repoRoot, "scripts");
const token = randomBytes(32).toString("hex");
const prefix = `sync-local-test-${randomUUID()}`;
const pool = new Pool({ connectionString: databaseUrl });
let postCount = 0;
let getCount = 0;
let putCount = 0;
let deleteCount = 0;
let pullCount = 0;
let conflictoCount = 0;
const conflictoSolicitudes: Array<{
  desde: string | null;
  desdeOperacion: string | null;
  endpoint: string | null;
  entidad: string | null;
  entidadId: string | null;
}> = [];
let conflictoStatusPorLlamada: (numero: number) => number = () => conflictoStatus;
let postStatus: (numero: number) => number = () => 200;
let putStatus: (numero: number) => number = () => 200;
let deleteStatus: (numero: number) => number = () => 200;
let conflictoStatus = 200;
let conflictoRemoto = false;

const server = createServer(
  (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader("Content-Type", "application/json");
    const path = request.url?.split("?")[0];
    if (path === "/api/healthz") {
      response.writeHead(200).end("{}");
      return;
    }
    if (path === "/api/sync/pull") {
      pullCount++;
      response.writeHead(200).end(
        JSON.stringify({
          eventos: [],
          hasta: "2000-01-01 00:00:00.000000",
          hastaOperacion: null,
          hayMas: false,
        }),
      );
      return;
    }
    if (path === "/api/sync/conflicto") {
      conflictoCount++;
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
      conflictoSolicitudes.push({
        desde: url.searchParams.get("desde"),
        desdeOperacion: url.searchParams.get("desdeOperacion"),
        endpoint: url.searchParams.get("endpoint"),
        entidad: url.searchParams.get("entidad"),
        entidadId: url.searchParams.get("entidadId"),
      });
      const status = conflictoStatusPorLlamada(conflictoCount);
      response.writeHead(status).end(
        JSON.stringify(
          status === 200
            ? {
                conflicto: conflictoRemoto,
                ...(conflictoRemoto
                  ? {
                      evento: {
                        operationId: "evento-remoto-test",
                        creadoEn: "2026-10-29 01:00:00.000000",
                        metodo: "PUT",
                        endpoint: "/test",
                      },
                    }
                  : {}),
              }
            : { error: "No disponible" },
        ),
      );
      return;
    }
    if (path?.startsWith("/api/test") && request.method === "GET") {
      getCount++;
      response.writeHead(404).end("{}");
      return;
    }
    if (path === "/api/test" && request.method === "POST") {
      postCount++;
      response.writeHead(postStatus(postCount)).end("{}");
      return;
    }
    if (path?.startsWith("/api/test") && request.method === "PUT") {
      putCount++;
      response.writeHead(putStatus(putCount)).end("{}");
      return;
    }
    if (path?.startsWith("/api/test") && request.method === "DELETE") {
      deleteCount++;
      response.writeHead(deleteStatus(deleteCount)).end("{}");
      return;
    }
    response.writeHead(200).end("{}");
  },
);

function ejecutarScript(nombre: string): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", join("src", nombre)],
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
    setTimeout(() => child.kill(), 30_000).unref();
  });
}

let port = 0;

async function insertarEventos(
  cantidad: number,
  nombre: string,
  metodo = "POST",
  endpoint = "/test",
): Promise<string[]> {
  const ids = Array.from({ length: cantidad }, (_, index) =>
    `${prefix}-${nombre}-${index + 1}`,
  );
  for (let index = 0; index < ids.length; index++) {
    await pool.query(
      `INSERT INTO eventos_sincronizacion
        (operation_id, entidad, entidad_id, tipo, metodo, endpoint, payload,
         origen, estado, creado_en)
       VALUES ($1, 'test', $1, 'crear', $3, $4, '{}'::jsonb,
               'local', 'pendiente', now() + ($2::int * interval '1 millisecond'))`,
      [ids[index], index, metodo, endpoint],
    );
  }
  return ids;
}

async function estados(ids: string[]): Promise<
  Array<{ operation_id: string; estado: string; intentos: number; ultimo_error: string | null }>
> {
  const result = await pool.query<{
    operation_id: string;
    estado: string;
    intentos: number;
    ultimo_error: string | null;
  }>(
    `SELECT operation_id, estado, intentos, ultimo_error
       FROM eventos_sincronizacion WHERE operation_id = ANY($1::text[])
       ORDER BY creado_en, operation_id`,
    [ids],
  );
  return result.rows;
}

async function borrarEventos(): Promise<void> {
  await pool.query(
    "DELETE FROM eventos_sincronizacion WHERE operation_id LIKE $1",
    [`${prefix}%`],
  );
  await pool.query(
    "DELETE FROM referencias_sincronizacion WHERE id_local LIKE $1",
    [`${prefix}%`],
  );
}

test("clasifica respuestas remotas y detecta conflictos antes de enviar", async () => {
  const anteriores = await pool.query<{
    valor: string;
    operacion_id: string | null;
  }>(
    `SELECT valor::text AS valor, operacion_id
       FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
  );
  assert.equal(anteriores.rowCount, 0, "La base aislada ya tiene un cursor remoto");

  const colaAjena = await pool.query<{ cantidad: string }>(
    `SELECT count(*)::text AS cantidad FROM eventos_sincronizacion
      WHERE origen = 'local' AND estado IN ('pendiente', 'error')`,
  );
  assert.equal(
    Number(colaAjena.rows[0]?.cantidad ?? 0),
    0,
    "La base aislada contiene operaciones pendientes ajenas a esta prueba",
  );

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  port = address.port;

  try {
    const [idSinCursor] = await insertarEventos(1, "sin-cursor");
    const sincronizacionSinCursor = await ejecutarScript("sincronizar-local.ts");
    assert.equal(sincronizacionSinCursor.status, 1);
    assert.match(
      `${sincronizacionSinCursor.stdout}\n${sincronizacionSinCursor.stderr}`,
      /pnpm run sync:init/,
    );
    assert.equal(postCount, 0);
    assert.equal(conflictoCount, 0);
    assert.deepEqual(
      (await estados([idSinCursor!])).map((evento) => [
        evento.estado,
        evento.intentos,
      ]),
      [["pendiente", 0]],
    );
    await borrarEventos();
    await pool.query(
      `INSERT INTO cursos_sincronizacion (nombre, valor, operacion_id)
       VALUES ('remoto', '2000-01-01 00:00:00'::timestamp, NULL)`,
    );

    const idsServicioCaido = await insertarEventos(2, "503");
    postCount = 0;
    conflictoCount = 0;
    postStatus = (numero) => numero === 1 ? 503 : 200;
    const servicioCaido = await ejecutarScript("sincronizar-todo.ts");
    assert.equal(servicioCaido.status, 1);
    assert.match(
      `${servicioCaido.stdout}\n${servicioCaido.stderr}`,
      /Render no está disponible; se reintentará en la próxima corrida/,
    );
    assert.equal(
      postCount,
      1,
      `${servicioCaido.stdout}\n${servicioCaido.stderr}`,
    );
    assert.equal(pullCount, 0);
    assert.equal(conflictoCount, 0);
    assert.deepEqual(
      (await estados(idsServicioCaido)).map((evento) => [
        evento.estado,
        evento.intentos,
      ]),
      [
        ["pendiente", 0],
        ["pendiente", 0],
      ],
    );
    await borrarEventos();

    const [idPutNoExistente] = await insertarEventos(1, "put-404", "PUT");
    await pool.query(
      "UPDATE eventos_sincronizacion SET endpoint = $2 WHERE operation_id = $1",
      [idPutNoExistente, `/test/${idPutNoExistente}`],
    );
    await pool.query(
      `INSERT INTO referencias_sincronizacion (entidad, id_local, id_remoto)
       VALUES ('test', $1, '777')`,
      [idPutNoExistente],
    );
    const cursorSinOperacion = await pool.query<{ valor: string }>(
      `SELECT valor::text AS valor FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
    );
    getCount = 0;
    putCount = 0;
    conflictoCount = 0;
    conflictoSolicitudes.length = 0;
    conflictoStatus = 200;
    conflictoRemoto = false;
    putStatus = () => 200;
    const putSinGet = await ejecutarScript("sincronizar-local.ts");
    assert.equal(putSinGet.status, 0, `${putSinGet.stdout}\n${putSinGet.stderr}`);
    assert.equal(getCount, 0, "No debe consultarse el recurso con GET");
    assert.equal(conflictoCount, 1, "No se consultó /sync/conflicto");
    assert.equal(putCount, 1, "El PUT real no llegó al servidor remoto");
    assert.equal((await estados([idPutNoExistente!]))[0]?.estado, "sincronizado");
    assert.deepEqual(conflictoSolicitudes[0], {
      desde: cursorSinOperacion.rows[0]?.valor,
      desdeOperacion: null,
      endpoint: "/test/777",
      entidad: null,
      entidadId: null,
    });
    await borrarEventos();

    const cursorOperacion = `${prefix}-cursor-op`;
    await pool.query(
      "UPDATE cursos_sincronizacion SET operacion_id = $1 WHERE nombre = 'remoto'",
      [cursorOperacion],
    );
    const [idPutConConsulta] = await insertarEventos(
      1,
      "put-query",
      "PUT",
      "/test?a=1",
    );
    const cursorCompuesto = await pool.query<{
      valor: string;
      operacion_id: string;
    }>(
      `SELECT valor::text AS valor, operacion_id
         FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
    );
    conflictoSolicitudes.length = 0;
    conflictoCount = 0;
    putCount = 0;
    const putConConsulta = await ejecutarScript("sincronizar-local.ts");
    assert.equal(
      putConConsulta.status,
      0,
      `${putConConsulta.stdout}\n${putConConsulta.stderr}`,
    );
    assert.deepEqual(conflictoSolicitudes[0], {
      desde: cursorCompuesto.rows[0]?.valor,
      desdeOperacion: cursorOperacion,
      endpoint: "/test?a=1",
      entidad: null,
      entidadId: null,
    });
    assert.equal(putCount, 1);
    await borrarEventos();
    await pool.query(
      "UPDATE cursos_sincronizacion SET operacion_id = NULL WHERE nombre = 'remoto'",
    );

    const [idDeleteNoExistente] = await insertarEventos(
      1,
      "delete-404",
      "DELETE",
    );
    getCount = 0;
    deleteCount = 0;
    conflictoCount = 0;
    conflictoStatus = 200;
    conflictoRemoto = false;
    deleteStatus = () => 200;
    const deleteSinGet = await ejecutarScript("sincronizar-local.ts");
    assert.equal(
      deleteSinGet.status,
      0,
      `${deleteSinGet.stdout}\n${deleteSinGet.stderr}`,
    );
    assert.equal(getCount, 0, "No debe consultarse el recurso con GET");
    assert.equal(conflictoCount, 1, "No se consultó /sync/conflicto");
    assert.equal(deleteCount, 1, "El DELETE real no llegó al servidor remoto");
    assert.equal(
      (await estados([idDeleteNoExistente!]))[0]?.estado,
      "sincronizado",
    );
    await borrarEventos();

    const [idPutConflicto] = await insertarEventos(1, "put-conflict", "PUT");
    getCount = 0;
    putCount = 0;
    conflictoCount = 0;
    conflictoStatus = 200;
    conflictoRemoto = false;
    putStatus = () => 409;
    const putConConflicto = await ejecutarScript("sincronizar-local.ts");
    assert.equal(putConConflicto.status, 3);
    assert.equal(getCount, 0);
    assert.equal(conflictoCount, 1);
    assert.equal(putCount, 1);
    const [estadoPutConflicto] = await estados([idPutConflicto!]);
    assert.equal(estadoPutConflicto?.estado, "conflicto");
    assert.equal(estadoPutConflicto?.intentos, 1);
    await borrarEventos();

    const [idPutCambioRemoto] = await insertarEventos(
      1,
      "put-remote-conflict",
      "PUT",
    );
    conflictoCount = 0;
    conflictoStatus = 200;
    conflictoRemoto = true;
    putCount = 0;
    const putConCambioRemoto = await ejecutarScript("sincronizar-local.ts");
    assert.equal(putConCambioRemoto.status, 3);
    assert.equal(conflictoCount, 1);
    assert.equal(putCount, 0, "PUT fue enviado pese al conflicto remoto");
    const [estadoCambioRemoto] = await estados([idPutCambioRemoto!]);
    assert.equal(estadoCambioRemoto?.estado, "conflicto");
    assert.equal(estadoCambioRemoto?.intentos, 1);
    assert.match(
      estadoCambioRemoto?.ultimo_error ?? "",
      /evento-remoto-test.*2026-10-29 01:00:00\.000000/,
    );
    conflictoRemoto = false;
    await borrarEventos();

    const [idPutVersionFaltante] = await insertarEventos(
      1,
      "put-api-missing",
      "PUT",
    );
    conflictoCount = 0;
    conflictoStatusPorLlamada = () => 404;
    putCount = 0;
    const apiFaltante = await ejecutarScript("sincronizar-local.ts");
    assert.equal(apiFaltante.status, 1);
    assert.match(
      `${apiFaltante.stdout}\n${apiFaltante.stderr}`,
      /Render no tiene la versión nueva de la API; despliégala primero/,
    );
    assert.equal(conflictoCount, 1);
    assert.equal(putCount, 0);
    assert.deepEqual(
      (await estados([idPutVersionFaltante!])).map((evento) => [
        evento.estado,
        evento.intentos,
        evento.ultimo_error,
      ]),
      [["pendiente", 0, null]],
    );
    conflictoStatusPorLlamada = () => conflictoStatus;
    await borrarEventos();

    const [idPutCon503] = await insertarEventos(1, "put-preflight-503", "PUT");
    getCount = 0;
    putCount = 0;
    conflictoCount = 0;
    conflictoStatus = 503;
    putStatus = () => 200;
    const putPreflight503 = await ejecutarScript("sincronizar-local.ts");
    assert.equal(putPreflight503.status, 1);
    assert.equal(getCount, 0);
    assert.equal(conflictoCount, 1);
    assert.equal(putCount, 0);
    assert.deepEqual(
      (await estados([idPutCon503!])).map((evento) => [
        evento.estado,
        evento.intentos,
        evento.ultimo_error,
      ]),
      [["pendiente", 0, null]],
    );
    await borrarEventos();

    const [idPutCon401] = await insertarEventos(1, "put-preflight-401", "PUT");
    getCount = 0;
    putCount = 0;
    conflictoCount = 0;
    conflictoStatus = 401;
    const putPreflight401 = await ejecutarScript("sincronizar-local.ts");
    assert.equal(putPreflight401.status, 2);
    assert.equal(getCount, 0);
    assert.equal(conflictoCount, 1);
    assert.equal(putCount, 0);
    assert.deepEqual(
      (await estados([idPutCon401!])).map((evento) => [
        evento.estado,
        evento.intentos,
        evento.ultimo_error,
      ]),
      [["pendiente", 0, null]],
    );
    await borrarEventos();

    const idsLlaveRechazada = await insertarEventos(2, "401");
    postCount = 0;
    conflictoCount = 0;
    postStatus = () => 401;
    const llaveRechazada = await ejecutarScript("sincronizar-todo.ts");
    assert.equal(llaveRechazada.status, 2);
    assert.match(
      `${llaveRechazada.stdout}\n${llaveRechazada.stderr}`,
      /Render rechazó la llave de sincronización; revisa SYNC_TOKEN/,
    );
    assert.equal(postCount, 1);
    assert.equal(conflictoCount, 0, "POST no debe consultar conflictos");
    assert.equal(pullCount, 0);
    assert.deepEqual(
      (await estados(idsLlaveRechazada)).map((evento) => [
        evento.estado,
        evento.intentos,
        evento.ultimo_error,
      ]),
      [
        ["pendiente", 0, null],
        ["pendiente", 0, null],
      ],
    );
    await borrarEventos();

    const idsConflicto = await insertarEventos(3, "409");
    postCount = 0;
    pullCount = 0;
    postStatus = (numero) => numero === 2 ? 409 : 200;
    const conflicto = await ejecutarScript("sincronizar-todo.ts");
    assert.equal(conflicto.status, 3);
    const estadosConflicto = await estados(idsConflicto);
    assert.deepEqual(
      estadosConflicto.map((evento) => evento.estado),
      ["sincronizado", "conflicto", "sincronizado"],
    );
    assert.equal(estadosConflicto[1]?.intentos, 1);
    assert.match(estadosConflicto[1]?.ultimo_error ?? "", /HTTP 409/);
    assert.equal(pullCount, 1, "sync:all no descargó después de un conflicto");
    await pool.query(
      "DELETE FROM cursos_sincronizacion WHERE nombre = 'remoto'",
    );
    await borrarEventos();

    await pool.query(
      `INSERT INTO cursos_sincronizacion (nombre, valor, operacion_id)
       VALUES ('remoto', '2000-01-01 00:00:00'::timestamp, NULL)`,
    );
    const [idErrorTemporal] = await insertarEventos(1, "500");
    postCount = 0;
    postStatus = () => 500;
    for (let intento = 1; intento <= 3; intento++) {
      const resultado = await ejecutarScript("sincronizar-local.ts");
      const estado = (await estados([idErrorTemporal!]))[0];
      assert.equal(estado?.intentos, intento);
      assert.equal(
        estado?.estado,
        intento < 3 ? "pendiente" : "error",
      );
      assert.equal(resultado.status, intento < 3 ? 0 : 3);
    }
  } finally {
    await borrarEventos();
    await pool.query(
      "DELETE FROM cursos_sincronizacion WHERE nombre = 'remoto'",
    );
    await new Promise<void>((resolveClose, reject) => {
      server.close((error) => (error ? reject(error) : resolveClose()));
    });
    await pool.end();
  }
});
