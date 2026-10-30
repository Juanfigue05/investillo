import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import test from "node:test";
import { TABLAS_HUELLA } from "@workspace/db/schema";

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
const prefix = `sync-remote-test-${randomUUID()}`;
const idBase = 20_000_000 + Number.parseInt(randomUUID().slice(0, 6), 16);
const pool = new Pool({ connectionString: databaseUrl });
type Evento = {
  operationId: string;
  endpoint: string;
  metodo: string;
  payload: unknown;
  entidad: string;
  entidadId: string;
  referenciasRespuesta: Array<{
    campo: string;
    entidad: string;
    valorLocal: string;
  }> | null;
  referenciasEndpoint: Array<{
    marcador: string;
    entidad: string;
    valorLocal: string;
  }> | null;
  creadoEn: string;
};

const eventosRecibidos: Array<{
  metodo: string;
  endpoint: string;
  payload: unknown;
}> = [];
const solicitudesRemotas: string[] = [];
const solicitudesLocales: string[] = [];
let eventosRemotos: Evento[] = [];
let proximoIdLocal = idBase + 900;
let puertoRemoto = 0;
let puertoLocal = 0;
const idsPrueba = [
  idBase + 1,
  idBase + 2,
  idBase + 3,
  idBase + 4,
  idBase + 5,
  idBase + 101,
  idBase + 102,
  idBase + 103,
  idBase + 104,
  idBase + 105,
  idBase + 201,
  idBase + 202,
  idBase + 203,
  idBase + 204,
  idBase + 205,
  idBase + 301,
  idBase + 302,
  idBase + 303,
  idBase + 304,
  idBase + 305,
].map(String);

function responder(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function leerCuerpo(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function crearEvento(
  metodo: string,
  endpoint: string,
  entidad: string,
  entidadId: string,
  payload: unknown = {},
  opciones: Partial<
    Pick<Evento, "referenciasEndpoint" | "referenciasRespuesta">
  > = {},
  secuencia = 1,
): Evento {
  return {
    operationId: `${prefix}-evento-${secuencia}`,
    endpoint,
    metodo,
    payload,
    entidad,
    entidadId,
    referenciasEndpoint: opciones.referenciasEndpoint ?? null,
    referenciasRespuesta: opciones.referenciasRespuesta ?? null,
    creadoEn: `2026-10-30 01:00:${String(secuencia).padStart(2, "0")}.000000`,
  };
}

function iniciarServidorRemoto() {
  return createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${puertoRemoto}`);
    solicitudesRemotas.push(url.pathname);
    if (url.pathname === "/api/sync/pull") {
      responder(response, 200, {
        eventos: eventosRemotos,
        hasta:
          eventosRemotos.at(-1)?.creadoEn ?? "2000-01-01 00:00:00.000000",
        hastaOperacion: eventosRemotos.at(-1)?.operationId ?? null,
        hayMas: false,
      });
      return;
    }
    if (url.pathname === "/api/sync/ack") {
      responder(response, 200, { ok: true });
      return;
    }
    responder(response, 404, { error: "No encontrado" });
  });
}

function iniciarServidorLocal() {
  return createServer(async (request, response) => {
    const endpoint = request.url?.replace(/^\/api/, "") ?? "/";
    solicitudesLocales.push(endpoint);
    const payload = await leerCuerpo(request);
    if (request.method === "POST" || request.method === "PUT" ||
        request.method === "PATCH" || request.method === "DELETE") {
      eventosRecibidos.push({
        metodo: request.method,
        endpoint,
        payload,
      });
    }
    if (request.method === "POST") {
      responder(response, 201, { id: proximoIdLocal++ });
      return;
    }
    responder(response, 200, {});
  });
}

function escuchar(
  server: ReturnType<typeof createServer>,
  host: string,
): Promise<number> {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("No se pudo obtener el puerto del servidor de prueba"));
        return;
      }
      resolveListen(address.port);
    });
  });
}

function cerrar(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
}

function ejecutarDescarga(): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolveExecution, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", join("src", "sincronizar-remoto.ts")],
      {
        cwd: scriptsRoot,
        timeout: 60_000,
        env: {
          ...process.env,
          NODE_ENV: "test",
          DATABASE_URL: databaseUrl,
          SYNC_REMOTE_API_URL: `http://127.0.0.1:${puertoRemoto}/api`,
          SYNC_TEST_ALLOW_LOCAL_HTTP: "true",
          SYNC_TOKEN: `${prefix}-token`,
          SYNC_PAGE_SIZE: "100",
          PORT: String(puertoLocal),
        },
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status) =>
      resolveExecution({ status, stdout, stderr }),
    );
  });
}

async function prepararBase(): Promise<void> {
  await pool.query(
    `ALTER TABLE cursos_sincronizacion
       ADD COLUMN IF NOT EXISTS operacion_id text;
     CREATE TABLE IF NOT EXISTS base_sincronizacion (
       tabla text PRIMARY KEY,
       total bigint NOT NULL,
       maximo_id bigint NOT NULL,
       creado_en timestamp NOT NULL DEFAULT now()
     );
     DELETE FROM cursos_sincronizacion WHERE nombre = 'remoto';
     DELETE FROM base_sincronizacion;`,
  );
  await pool.query(
    "DELETE FROM eventos_sincronizacion WHERE operation_id LIKE $1",
    [`${prefix}%`],
  );
  await pool.query(
    `DELETE FROM referencias_sincronizacion
      WHERE id_local LIKE $1 OR id_remoto LIKE $1`,
    [`${prefix}%`],
  );
  await pool.query(
    `INSERT INTO cursos_sincronizacion (nombre, valor, operacion_id)
     VALUES ('remoto', '2000-01-01 00:00:00'::timestamp, NULL)`,
  );
  for (const tabla of TABLAS_HUELLA) {
    await pool.query(
      `INSERT INTO base_sincronizacion (tabla, total, maximo_id)
       VALUES ($1, 0, 1000)`,
      [tabla],
    );
  }
}

async function insertarEquivalencia(
  entidad: string,
  local: string,
  remoto: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO referencias_sincronizacion (entidad, id_local, id_remoto)
     VALUES ($1, $2, $3)`,
    [entidad, local, remoto],
  );
}

async function cursor(): Promise<{ valor: string; operacion_id: string | null }> {
  const result = await pool.query<{
    valor: string;
    operacion_id: string | null;
  }>(
    `SELECT valor::text AS valor, operacion_id
       FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
  );
  assert.ok(result.rows[0]);
  return result.rows[0];
}

test("descarga traduce referencias, conserva el cursor ante esperas y rechaza referencias desconocidas", async () => {
  const remoto = iniciarServidorRemoto();
  const local = iniciarServidorLocal();
  try {
    await prepararBase();
    puertoRemoto = await escuchar(remoto, "127.0.0.1");
    puertoLocal = await escuchar(local, "::");

    await Promise.all([
      insertarEquivalencia("producto", idsPrueba[0]!, idsPrueba[5]!),
      insertarEquivalencia("trabajador", idsPrueba[1]!, idsPrueba[6]!),
      insertarEquivalencia("cliente", idsPrueba[2]!, idsPrueba[7]!),
      insertarEquivalencia("vehiculo", idsPrueba[3]!, idsPrueba[8]!),
      insertarEquivalencia("venta", idsPrueba[4]!, idsPrueba[9]!),
      insertarEquivalencia("cliente", String(idBase + 500), idsPrueba[18]!),
      insertarEquivalencia("vehiculo", String(idBase + 501), idsPrueba[18]!),
    ]);
    const mapeoVentaUno = await pool.query(
      `SELECT 1 FROM referencias_sincronizacion
        WHERE entidad = 'venta' AND id_remoto = '1'`,
    );
    if (mapeoVentaUno.rowCount === 0) {
      await insertarEquivalencia("venta", idsPrueba[19]!, "1");
    }
    const compartido = await pool.query<{ id: number }>(
      `SELECT candidato.id
         FROM generate_series(1, 1000) AS candidato(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM referencias_sincronizacion referencia
           WHERE referencia.entidad = 'producto'
             AND referencia.id_remoto = candidato.id::text
        )
        ORDER BY candidato.id DESC LIMIT 1`,
    );
    assert.ok(compartido.rows[0]);
    const idCompartido = compartido.rows[0].id;
    eventosRemotos = [
      crearEvento("POST", "/ventas", "venta", idsPrueba[10]!, {
        productoId: Number(idsPrueba[5]),
        cantidad: 1,
      }, {}, 1),
      crearEvento("PUT", `/ventas/${idsPrueba[9]}`, "venta", idsPrueba[9]!, {
        productoId: Number(idsPrueba[5]),
        distribuciones: [{ trabajadorId: Number(idsPrueba[6]) }],
      }, {}, 2),
      crearEvento("POST", "/ventas/lote-pago-antiguo", "venta", idsPrueba[11]!, {
        items: [{ productoId: Number(idsPrueba[5]) }],
      }, {}, 3),
      crearEvento("POST", "/grupos-trabajo", "grupo_trabajo", idsPrueba[12]!, {
        trabajadorIds: [Number(idsPrueba[6])],
      }, {}, 4),
      crearEvento(
        "PUT",
        "/clientes/{clienteId}/vehiculos/{id}",
        "vehiculo",
        idsPrueba[8]!,
        { placa: "TRADUCIDA" },
        {
          referenciasEndpoint: [{
            marcador: "{clienteId}",
            entidad: "cliente",
            valorLocal: idsPrueba[7]!,
          }],
        },
        5,
      ),
      crearEvento(
        "PUT",
        "/clientes/5/vehiculos/6",
        "vehiculo",
        "6",
        { placa: "PADRE-ANTIGUO" },
        {
          referenciasEndpoint: [{
            marcador: "{clienteId}",
            entidad: "cliente",
            valorLocal: "5",
          }],
        },
        6,
      ),
      crearEvento(
        "DELETE",
        `/historial-precios/producto/${idsPrueba[5]}`,
        "historial_precios",
        idsPrueba[13]!,
        {},
        {},
        7,
      ),
      crearEvento("POST", "/ventas", "venta", idsPrueba[14]!, {
        productoId: idCompartido,
      }, {}, 8),
      crearEvento("POST", "/clientes", "cliente", idsPrueba[15]!, {
        nombre: "Creado en Render",
      }, {}, 9),
      crearEvento(
        "PUT",
        `/clientes/${idsPrueba[18]}/vehiculos/${idsPrueba[18]}`,
        "vehiculo",
        idsPrueba[18]!,
        { placa: "IDS-IGUALES" },
        {
          referenciasEndpoint: [{
            marcador: "{clienteId}",
            entidad: "cliente",
            valorLocal: idsPrueba[18]!,
          }],
        },
        10,
      ),
      crearEvento("PUT", "/ventas/12", "venta", "1", {}, {}, 11),
    ];
    const comprobacionServidor = await fetch(
      `http://127.0.0.1:${puertoRemoto}/api/sync/pull`,
    );
    assert.equal(comprobacionServidor.status, 200);
    const descarga = await ejecutarDescarga();
    assert.equal(
      descarga.status,
      0,
      `${descarga.stdout}\n${descarga.stderr}\n` +
        `remoto=${solicitudesRemotas.join(",")} local=${solicitudesLocales.join(",")}`,
    );
    assert.deepEqual(
      eventosRecibidos.map(({ metodo, endpoint, payload }) => [
        metodo,
        endpoint,
        payload,
      ]),
      [
        ["POST", "/ventas", { productoId: Number(idsPrueba[0]), cantidad: 1 }],
        [
          "PUT",
          `/ventas/${idsPrueba[4]}`,
          {
            productoId: Number(idsPrueba[0]),
            distribuciones: [{ trabajadorId: Number(idsPrueba[1]) }],
          },
        ],
        [
          "POST",
          "/ventas/lote-pago-antiguo",
          { items: [{ productoId: Number(idsPrueba[0]) }] },
        ],
        ["POST", "/grupos-trabajo", { trabajadorIds: [Number(idsPrueba[1])] }],
        [
          "PUT",
          `/clientes/${idsPrueba[2]}/vehiculos/${idsPrueba[3]}`,
          { placa: "TRADUCIDA" },
        ],
        ["PUT", "/clientes/5/vehiculos/6", { placa: "PADRE-ANTIGUO" }],
        ["DELETE", `/historial-precios/producto/${idsPrueba[0]}`, {}],
        ["POST", "/ventas", { productoId: idCompartido }],
        ["POST", "/clientes", { nombre: "Creado en Render" }],
        [
          "PUT",
          `/clientes/${idBase + 500}/vehiculos/${idBase + 501}`,
          { placa: "IDS-IGUALES" },
        ],
        ["PUT", "/ventas/12", {}],
      ],
    );
    const mapeoCreado = await pool.query<{
      id_local: string;
      id_remoto: string;
    }>(
      `SELECT id_local, id_remoto FROM referencias_sincronizacion
        WHERE entidad = 'cliente' AND id_remoto = $1`,
      [idsPrueba[15]],
    );
    assert.equal(mapeoCreado.rowCount, 1);
    assert.equal(mapeoCreado.rows[0]?.id_local, String(idBase + 904));

    eventosRecibidos.length = 0;
    const cursorAntesConflicto = await cursor();
    eventosRemotos = [
      crearEvento("POST", "/ventas", "venta", idsPrueba[16]!, {
        productoId: idBase + 1001,
      }, {}, 12),
    ];
    const referenciaSinEquivalencia = await ejecutarDescarga();
    assert.notEqual(referenciaSinEquivalencia.status, 0);
    assert.match(
      `${referenciaSinEquivalencia.stdout}\n${referenciaSinEquivalencia.stderr}`,
      new RegExp(`Referencia sin equivalente local: producto ${idBase + 1001}`),
    );
    assert.equal(eventosRecibidos.length, 0);
    assert.deepEqual(await cursor(), cursorAntesConflicto);

    const cursorAntesEspera = await cursor();
    eventosRemotos = [
      crearEvento("POST", "/ventas", "venta", idsPrueba[17]!, {
        productoId: idBase + 1002,
      }, {}, 13),
      crearEvento(
        "POST",
        "/inventario",
        "producto",
        String(idBase + 1002),
        { nombre: "Producto que se creará después" },
        {},
        14,
      ),
    ];
    const referenciaEnEspera = await ejecutarDescarga();
    assert.notEqual(referenciaEnEspera.status, 0);
    assert.match(
      `${referenciaEnEspera.stdout}\n${referenciaEnEspera.stderr}`,
      new RegExp(`Espera la creación remota de producto ${idBase + 1002}`),
    );
    assert.equal(eventosRecibidos.length, 0);
    assert.deepEqual(await cursor(), cursorAntesEspera);
  } finally {
    await Promise.all([cerrar(remoto), cerrar(local)]);
    await pool.query(
      `DELETE FROM referencias_sincronizacion
        WHERE id_local = ANY($1::text[]) OR id_remoto = ANY($1::text[])`,
      [idsPrueba],
    );
    await pool.query(
      `DELETE FROM eventos_sincronizacion WHERE operation_id LIKE $1`,
      [`${prefix}%`],
    );
    await pool.query(
      `DELETE FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
    );
    await pool.end();
  }
});
