import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
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
const token = randomBytes(32).toString("hex");
const prefix = `sync-local-test-${randomUUID()}`;
const referenciasDePrueba: Array<[string, string]> = [
  ["producto", "2000"],
  ["producto", "999"],
  ["producto", "2001"],
  ["producto", "2002"],
  ["producto", "400"],
  ["producto", "401"],
  ["trabajador", "50"],
  ["trabajador", "51"],
  ["venta", "1"],
  ["venta", "12"],
  ["venta", "13"],
  ["venta", "1000"],
  ["venta", "1001"],
  ["venta", "3500"],
  ["producto", "3500"],
  ["producto", "3501"],
  ["producto", "3502"],
  ["cliente", "5"],
  ["cliente", "1500"],
  ["cliente", "1501"],
  ["cliente", "1502"],
  ["cliente", "1503"],
  ["credito", "5"],
  ["vehiculo", "20"],
];
const pool = new Pool({ connectionString: databaseUrl });
let postCount = 0;
let siguienteIdRemotoPrueba = 7000;
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
let respuestaPost: (endpoint: string, payload: unknown) => unknown = () => ({});
const solicitudesRecibidas: Array<{
  metodo: string;
  endpoint: string;
  payload: unknown;
}> = [];

const server = createServer(
  async (request: IncomingMessage, response: ServerResponse) => {
    const bodyChunks: Buffer[] = [];
    for await (const chunk of request) bodyChunks.push(Buffer.from(chunk));
    const bodyText = Buffer.concat(bodyChunks).toString("utf8");
    response.setHeader("Content-Type", "application/json");
    const path = request.url?.split("?")[0];
    if (
      path?.startsWith("/api/") &&
      !path.startsWith("/api/sync/") &&
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method ?? "")
    ) {
      let payload: unknown = {};
      if (bodyText) {
        try {
          payload = JSON.parse(bodyText);
        } catch {
          payload = bodyText;
        }
      }
      solicitudesRecibidas.push({
        metodo: request.method ?? "",
        endpoint: request.url?.slice(4) ?? "",
        payload,
      });
    }
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
    if (request.method === "POST" && path?.startsWith("/api/") && !path.startsWith("/api/sync/")) {
      postCount++;
      const resultado = respuestaPost(
        request.url?.slice(4) ?? "",
        solicitudesRecibidas.at(-1)?.payload,
      );
      response
        .writeHead(postStatus(postCount))
        .end(JSON.stringify(resultado));
      return;
    }
    if (request.method === "PUT" && path?.startsWith("/api/") && !path.startsWith("/api/sync/")) {
      putCount++;
      response.writeHead(putStatus(putCount)).end("{}");
      return;
    }
    if (request.method === "DELETE" && path?.startsWith("/api/") && !path.startsWith("/api/sync/")) {
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
  endpoint?: string,
): Promise<string[]> {
  const ids = Array.from({ length: cantidad }, (_, index) =>
    `${prefix}-${nombre}-${index + 1}`,
  );
  const entidadId = ["PUT", "DELETE", "PATCH"].includes(metodo)
    ? "12"
    : undefined;
  for (let index = 0; index < ids.length; index++) {
    await pool.query(
      `INSERT INTO eventos_sincronizacion
        (operation_id, entidad, entidad_id, tipo, metodo, endpoint, payload,
         origen, estado, creado_en)
       VALUES ($1, 'venta', COALESCE($5, $1), 'crear', $3, $4, '{}'::jsonb,
               'local', 'pendiente', now() + ($2::int * interval '1 millisecond'))`,
      [
        ids[index],
        index,
        metodo,
        endpoint === undefined
          ? metodo === "POST"
            ? "/ventas"
            : `/ventas/${entidadId}`
          : endpoint.startsWith("/test")
            ? metodo === "POST"
              ? `/ventas${endpoint.slice("/test".length)}`
              : `/ventas/${entidadId}${endpoint.slice("/test".length)}`
            : endpoint,
        entidadId,
      ],
    );
  }
  return ids;
}

async function insertarEvento(payload: {
  nombre: string;
  entidad: string;
  entidadId: string;
  metodo: string;
  endpoint: string;
  cuerpo: unknown;
  desplazamientoMs?: number;
  referenciasRespuesta?: unknown;
  referenciasEndpoint?: unknown;
}): Promise<string> {
  const operationId = `${prefix}-${payload.nombre}`;
  await pool.query(
    `INSERT INTO eventos_sincronizacion
      (operation_id, entidad, entidad_id, tipo, metodo, endpoint, payload,
       referencias_respuesta, referencias_endpoint, origen, estado, creado_en)
     VALUES ($1, $2, $3, 'crear', $4, $5, $6::jsonb, $7::jsonb, $8::jsonb,
             'local', 'pendiente',
             now() + ($9::int * interval '1 millisecond'))`,
    [
      operationId,
      payload.entidad,
      payload.entidadId,
      payload.metodo,
      payload.endpoint,
      JSON.stringify(payload.cuerpo),
      payload.referenciasRespuesta
        ? JSON.stringify(payload.referenciasRespuesta)
        : null,
      payload.referenciasEndpoint
        ? JSON.stringify(payload.referenciasEndpoint)
        : null,
      payload.desplazamientoMs ?? 0,
    ],
  );
  return operationId;
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

function valoresReferenciasSql(): string {
  return `VALUES ${referenciasDePrueba
    .map((_, indice) => `($${indice * 2 + 1}, $${indice * 2 + 2})`)
    .join(", ")}`;
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS base_sincronizacion (
      tabla text PRIMARY KEY,
      total bigint NOT NULL,
      maximo_id bigint NOT NULL,
      creado_en timestamp NOT NULL DEFAULT now()
    )
  `);
  const baseAnterior = await pool.query<{
    tabla: string;
    total: string;
    maximo_id: string;
    creado_en: Date;
  }>(
    `SELECT tabla, total::text, maximo_id::text, creado_en
       FROM base_sincronizacion`,
  );
  const referenciasAnteriores = await pool.query<{
    entidad: string;
    id_local: string;
    id_remoto: string;
  }>(
    `SELECT entidad, id_local, id_remoto
       FROM referencias_sincronizacion
      WHERE (entidad, id_local) IN (${valoresReferenciasSql()})`,
    referenciasDePrueba.flat(),
  );
  await pool.query(
    `DELETE FROM referencias_sincronizacion
      WHERE (entidad, id_local) IN (${valoresReferenciasSql()})`,
    referenciasDePrueba.flat(),
  );
  await pool.query("DELETE FROM base_sincronizacion");
  for (const tabla of TABLAS_HUELLA) {
    await pool.query(
      `INSERT INTO base_sincronizacion (tabla, total, maximo_id)
       VALUES ($1, 0, 1000)`,
      [tabla],
    );
  }

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

    const [idSinBase] = await insertarEventos(1, "sin-base");
    await pool.query("DELETE FROM base_sincronizacion");
    const solicitudesAntesSinBase = solicitudesRecibidas.length;
    const sinBase = await ejecutarScript("sincronizar-local.ts");
    assert.equal(sinBase.status, 1);
    assert.match(
      `${sinBase.stdout}\n${sinBase.stderr}`,
      /Falta el punto de partida/,
    );
    assert.equal(solicitudesRecibidas.length, solicitudesAntesSinBase);
    assert.deepEqual(
      (await estados([idSinBase!])).map((evento) => [
        evento.estado,
        evento.intentos,
      ]),
      [["pendiente", 0]],
    );
    const pullAntesSinBase = pullCount;
    const descargaSinBase = await ejecutarScript("sincronizar-remoto.ts");
    assert.equal(descargaSinBase.status, 1);
    assert.match(
      `${descargaSinBase.stdout}\n${descargaSinBase.stderr}`,
      /Falta el punto de partida/,
    );
    assert.equal(pullCount, pullAntesSinBase);
    await borrarEventos();
    for (const tabla of TABLAS_HUELLA) {
      await pool.query(
        `INSERT INTO base_sincronizacion (tabla, total, maximo_id)
         VALUES ($1, 0, 1000)`,
        [tabla],
      );
    }

    solicitudesRecibidas.length = 0;
    respuestaPost = () => ({ id: siguienteIdRemotoPrueba++ });
    const crearProducto = await insertarEvento({
      nombre: "referencia-producto-creador",
      entidad: "producto",
      entidadId: "2000",
      metodo: "POST",
      endpoint: "/inventario",
      cuerpo: { nombre: "Producto local" },
    });
    const crearVenta = await insertarEvento({
      nombre: "referencia-producto-venta",
      entidad: "venta",
      entidadId: "3000",
      metodo: "POST",
      endpoint: "/ventas",
      cuerpo: { productoId: 2000, cantidad: 1 },
      desplazamientoMs: 1,
    });
    postCount = 0;
    const mapeado = await ejecutarScript("sincronizar-local.ts");
    assert.equal(mapeado.status, 0, `${mapeado.stdout}\n${mapeado.stderr}`);
    assert.deepEqual(
      solicitudesRecibidas.map(({ metodo, endpoint, payload }) => [
        metodo,
        endpoint,
        payload,
      ]),
      [
        ["POST", "/inventario", { nombre: "Producto local" }],
        ["POST", "/ventas", { productoId: 7000, cantidad: 1 }],
      ],
    );
    assert.deepEqual(
      (
        await pool.query<{ id_remoto: string }>(
          `SELECT id_remoto FROM referencias_sincronizacion
            WHERE entidad = 'producto' AND id_local = '2000'`,
        )
      ).rows.map((fila) => fila.id_remoto),
      ["7000"],
    );
    assert.deepEqual(
      (await estados([crearProducto, crearVenta])).map((evento) => evento.estado),
      ["sincronizado", "sincronizado"],
    );
    await borrarEventos();

    solicitudesRecibidas.length = 0;
    await pool.query(
      `DELETE FROM referencias_sincronizacion
        WHERE entidad = 'producto' AND id_local IN ('999', '2001')`,
    );
    const ventaConIdInicial = await insertarEvento({
      nombre: "referencia-producto-inicial",
      entidad: "venta",
      entidadId: "3001",
      metodo: "POST",
      endpoint: "/ventas",
      cuerpo: { productoId: 999 },
    });
    postCount = 0;
    const referenciaInicial = await ejecutarScript("sincronizar-local.ts");
    const estadoReferenciaInicial = await estados([ventaConIdInicial]);
    assert.equal(
      referenciaInicial.status,
      0,
      `${referenciaInicial.stdout}\n${referenciaInicial.stderr}\n${JSON.stringify(estadoReferenciaInicial)}`,
    );
    assert.deepEqual(solicitudesRecibidas.at(-1), {
      metodo: "POST",
      endpoint: "/ventas",
      payload: { productoId: 999 },
    });
    await borrarEventos();

    solicitudesRecibidas.length = 0;
    const ventaSinMapeo = await insertarEvento({
      nombre: "referencia-producto-sin-mapeo",
      entidad: "venta",
      entidadId: "3002",
      metodo: "POST",
      endpoint: "/ventas",
      cuerpo: { productoId: 2001 },
    });
    postCount = 0;
    const referenciaSinMapeo = await ejecutarScript("sincronizar-local.ts");
    assert.equal(referenciaSinMapeo.status, 3);
    assert.equal(solicitudesRecibidas.length, 0);
    assert.deepEqual(
      (await estados([ventaSinMapeo])).map((evento) => [
        evento.estado,
        evento.intentos,
        evento.ultimo_error,
      ]),
      [[
        "conflicto",
        1,
        "Referencia sin equivalente remoto: producto 2001",
      ]],
    );
    await borrarEventos();

    solicitudesRecibidas.length = 0;
    const ventaEnEspera = await insertarEvento({
      nombre: "referencia-producto-espera-venta",
      entidad: "venta",
      entidadId: "3003",
      metodo: "POST",
      endpoint: "/ventas",
      cuerpo: { productoId: 2002 },
      desplazamientoMs: -1,
    });
    const productoEnEspera = await insertarEvento({
      nombre: "referencia-producto-espera-creador",
      entidad: "producto",
      entidadId: "2002",
      metodo: "POST",
      endpoint: "/inventario",
      cuerpo: { nombre: "Producto en espera" },
      desplazamientoMs: 1,
    });
    postCount = 0;
    const espera = await ejecutarScript("sincronizar-local.ts");
    assert.equal(espera.status, 0, `${espera.stdout}\n${espera.stderr}`);
    assert.deepEqual(
      solicitudesRecibidas.map(({ metodo, endpoint }) => [metodo, endpoint]),
      [["POST", "/inventario"]],
    );
    assert.deepEqual(
      (await estados([ventaEnEspera])).map((evento) => [
        evento.estado,
        evento.intentos,
        evento.ultimo_error,
      ]),
      [["pendiente", 0, "Espera la creación de producto 2002"]],
    );
    assert.equal((await estados([productoEnEspera]))[0]?.estado, "sincronizado");
    await borrarEventos();

    await pool.query(
      `INSERT INTO referencias_sincronizacion (entidad, id_local, id_remoto)
       VALUES ('producto', '400', '1400'), ('producto', '401', '1401'),
              ('trabajador', '50', '1500'), ('trabajador', '51', '1501'),
              ('venta', '1', '99')
       ON CONFLICT (entidad, id_local) DO UPDATE SET id_remoto = EXCLUDED.id_remoto`,
    );
    solicitudesRecibidas.length = 0;
    const eventosArreglos = [
      await insertarEvento({
        nombre: "referencia-arreglo-productos",
        entidad: "venta",
        entidadId: "3100",
        metodo: "POST",
        endpoint: "/ventas/lote-pago-antiguo",
        cuerpo: { items: [{ productoId: 400 }] },
      }),
      await insertarEvento({
        nombre: "referencia-arreglo-distribuciones",
        entidad: "venta",
        entidadId: "3101",
        metodo: "POST",
        endpoint: "/ventas/manoobra",
        cuerpo: { distribuciones: [{ trabajadorId: 50 }] },
      }),
      await insertarEvento({
        nombre: "referencia-arreglo-trabajadores",
        entidad: "grupo_trabajo",
        entidadId: "3102",
        metodo: "POST",
        endpoint: "/grupos-trabajo",
        cuerpo: { trabajadorIds: [50, 51] },
      }),
      await insertarEvento({
        nombre: "referencia-segmento-precio",
        entidad: "historial_precios",
        entidadId: "401",
        metodo: "DELETE",
        endpoint: "/historial-precios/producto/401",
        cuerpo: {},
      }),
      await insertarEvento({
        nombre: "referencia-endpoint-segmento-exacto",
        entidad: "venta",
        entidadId: "1",
        metodo: "PUT",
        endpoint: "/ventas/12",
        cuerpo: {},
      }),
    ];
    postCount = 0;
    putCount = 0;
    deleteCount = 0;
    conflictoCount = 0;
    const arreglosYEndpoint = await ejecutarScript("sincronizar-local.ts");
    assert.equal(
      arreglosYEndpoint.status,
      0,
      `${arreglosYEndpoint.stdout}\n${arreglosYEndpoint.stderr}`,
    );
    assert.deepEqual(
      solicitudesRecibidas.map(({ metodo, endpoint, payload }) => [
        metodo,
        endpoint,
        payload,
      ]),
      [
        [
          "POST",
          "/ventas/lote-pago-antiguo",
          { items: [{ productoId: 1400 }] },
        ],
        [
          "POST",
          "/ventas/manoobra",
          { distribuciones: [{ trabajadorId: 1500 }] },
        ],
        ["POST", "/grupos-trabajo", { trabajadorIds: [1500, 1501] }],
        ["DELETE", "/historial-precios/producto/1401", {}],
        ["PUT", "/ventas/12", {}],
      ],
    );
    await borrarEventos();
    await pool.query(
      `DELETE FROM referencias_sincronizacion
        WHERE (entidad, id_local) IN (
          ('producto', '400'), ('producto', '401'),
          ('trabajador', '50'), ('trabajador', '51'),
          ('venta', '1')
        )`,
    );
    respuestaPost = () => ({});

    await pool.query(
      `INSERT INTO referencias_sincronizacion (entidad, id_local, id_remoto)
       VALUES ('venta', '13', '1013'),
              ('producto', '3501', '13501'),
              ('cliente', '1503', '15503')
       ON CONFLICT (entidad, id_local) DO UPDATE SET id_remoto = EXCLUDED.id_remoto`,
    );
    solicitudesRecibidas.length = 0;
    const ownIds = [
      await insertarEvento({
        nombre: "own-venta-conflicto-nuevo",
        entidad: "venta",
        entidadId: "3500",
        metodo: "PUT",
        endpoint: "/ventas/3500",
        cuerpo: {},
      }),
      await insertarEvento({
        nombre: "own-venta-compartida",
        entidad: "venta",
        entidadId: "12",
        metodo: "PUT",
        endpoint: "/ventas/12",
        cuerpo: {},
      }),
      await insertarEvento({
        nombre: "own-venta-limite-inclusivo",
        entidad: "venta",
        entidadId: "1000",
        metodo: "PUT",
        endpoint: "/ventas/1000",
        cuerpo: {},
      }),
      await insertarEvento({
        nombre: "own-venta-limite-mas-uno",
        entidad: "venta",
        entidadId: "1001",
        metodo: "PUT",
        endpoint: "/ventas/1001",
        cuerpo: {},
      }),
      await insertarEvento({
        nombre: "own-venta-traducida",
        entidad: "venta",
        entidadId: "13",
        metodo: "PUT",
        endpoint: "/ventas/13",
        cuerpo: {},
      }),
    ];
    putCount = 0;
    conflictoCount = 0;
    const idsPropios = await ejecutarScript("sincronizar-local.ts");
    assert.equal(idsPropios.status, 3);
    assert.deepEqual(
      solicitudesRecibidas.map(({ metodo, endpoint }) => [metodo, endpoint]),
      [
        ["PUT", "/ventas/12"],
        ["PUT", "/ventas/1000"],
        ["PUT", "/ventas/1013"],
      ],
    );
    assert.deepEqual(
      (await estados([ownIds[0]!, ownIds[3]!])).map((evento) => [
        evento.estado,
        evento.intentos,
        evento.ultimo_error,
      ]),
      [
        ["conflicto", 1, "Referencia sin equivalente remoto: venta 3500"],
        ["conflicto", 1, "Referencia sin equivalente remoto: venta 1001"],
      ],
    );
    await borrarEventos();

    solicitudesRecibidas.length = 0;
    const productoCreacionSinIdRuta = await insertarEvento({
      nombre: "own-post-sin-id-propio",
      entidad: "producto",
      entidadId: "3502",
      metodo: "POST",
      endpoint: "/inventario",
      cuerpo: { nombre: "Creación sin ID en endpoint" },
    });
    postCount = 0;
    const postSinIdPropio = await ejecutarScript("sincronizar-local.ts");
    assert.equal(
      postSinIdPropio.status,
      0,
      `${postSinIdPropio.stdout}\n${postSinIdPropio.stderr}`,
    );
    assert.deepEqual(solicitudesRecibidas.map(({ endpoint }) => endpoint), [
      "/inventario",
    ]);
    assert.equal((await estados([productoCreacionSinIdRuta]))[0]?.estado, "sincronizado");
    await borrarEventos();

    solicitudesRecibidas.length = 0;
    const traslados = [
      await insertarEvento({
        nombre: "traslado-producto-sin-mapeo",
        entidad: "producto",
        entidadId: "3500",
        metodo: "POST",
        endpoint: "/ventas/3500/trasladar",
        cuerpo: {},
      }),
      await insertarEvento({
        nombre: "traslado-producto-mapeado",
        entidad: "producto",
        entidadId: "3501",
        metodo: "POST",
        endpoint: "/ventas/3501/trasladar",
        cuerpo: {},
      }),
    ];
    postCount = 0;
    const resultadoTraslados = await ejecutarScript("sincronizar-local.ts");
    assert.equal(resultadoTraslados.status, 3);
    assert.deepEqual(solicitudesRecibidas.map(({ endpoint }) => endpoint), [
      "/ventas/13501/trasladar",
    ]);
    assert.deepEqual(
      (await estados([traslados[0]!])).map((evento) => [
        evento.estado,
        evento.ultimo_error,
      ]),
      [["conflicto", "Referencia sin equivalente remoto: producto 3500"]],
    );
    await borrarEventos();

    const referenciaCliente = (valorLocal: string) => [{
      marcador: "{clienteId}",
      entidad: "cliente",
      valorLocal,
    }];
    solicitudesRecibidas.length = 0;
    const vehiculoClienteAntiguo = await insertarEvento({
      nombre: "vehiculo-cliente-compartido",
      entidad: "vehiculo",
      entidadId: "40",
      metodo: "POST",
      endpoint: "/clientes/{clienteId}/vehiculos",
      referenciasEndpoint: referenciaCliente("5"),
      cuerpo: { placa: "CLIENTE-ANTIGUO" },
    });
    postCount = 0;
    const clienteCompartido = await ejecutarScript("sincronizar-local.ts");
    assert.equal(
      clienteCompartido.status,
      0,
      `${clienteCompartido.stdout}\n${clienteCompartido.stderr}`,
    );
    assert.deepEqual(
      solicitudesRecibidas.map(({ endpoint }) => endpoint),
      ["/clientes/5/vehiculos"],
    );
    assert.equal((await estados([vehiculoClienteAntiguo]))[0]?.estado, "sincronizado");
    await borrarEventos();

    solicitudesRecibidas.length = 0;
    const vehiculoClienteMapeado = await insertarEvento({
      nombre: "vehiculo-cliente-mapeado",
      entidad: "vehiculo",
      entidadId: "41",
      metodo: "POST",
      endpoint: "/clientes/{clienteId}/vehiculos",
      referenciasEndpoint: referenciaCliente("1503"),
      cuerpo: { placa: "CLIENTE-MAPEADO" },
    });
    postCount = 0;
    const clienteMapeado = await ejecutarScript("sincronizar-local.ts");
    assert.equal(clienteMapeado.status, 0);
    assert.deepEqual(
      solicitudesRecibidas.map(({ endpoint }) => endpoint),
      ["/clientes/15503/vehiculos"],
    );
    assert.equal((await estados([vehiculoClienteMapeado]))[0]?.estado, "sincronizado");
    await borrarEventos();

    solicitudesRecibidas.length = 0;
    const vehiculoClienteNuevo = await insertarEvento({
      nombre: "vehiculo-cliente-nuevo",
      entidad: "vehiculo",
      entidadId: "42",
      metodo: "POST",
      endpoint: "/clientes/{clienteId}/vehiculos",
      referenciasEndpoint: referenciaCliente("1500"),
      cuerpo: { placa: "CLIENTE-NUEVO" },
      desplazamientoMs: -1,
    });
    const creacionClientePendiente = await insertarEvento({
      nombre: "cliente-creador-pendiente",
      entidad: "cliente",
      entidadId: "1500",
      metodo: "POST",
      endpoint: "/clientes",
      cuerpo: { nombre: "Cliente en creación" },
      desplazamientoMs: 1,
    });
    postCount = 0;
    respuestaPost = (endpoint) =>
      endpoint === "/clientes" ? { id: 15000 } : {};
    const esperaCliente = await ejecutarScript("sincronizar-local.ts");
    assert.equal(esperaCliente.status, 0);
    assert.deepEqual(
      solicitudesRecibidas.map(({ endpoint }) => endpoint),
      ["/clientes"],
    );
    assert.deepEqual(
      (await estados([vehiculoClienteNuevo])).map((evento) => [
        evento.estado,
        evento.intentos,
        evento.ultimo_error,
      ]),
      [["pendiente", 0, "Espera la creación de cliente 1500"]],
    );
    assert.equal((await estados([creacionClientePendiente]))[0]?.estado, "sincronizado");
    await borrarEventos();
    respuestaPost = () => ({});

    solicitudesRecibidas.length = 0;
    const vehiculoClienteInexistente = await insertarEvento({
      nombre: "vehiculo-cliente-conflicto",
      entidad: "vehiculo",
      entidadId: "43",
      metodo: "POST",
      endpoint: "/clientes/{clienteId}/vehiculos",
      referenciasEndpoint: referenciaCliente("1501"),
      cuerpo: { placa: "CLIENTE-CONFLICTO" },
    });
    postCount = 0;
    const conflictoCliente = await ejecutarScript("sincronizar-local.ts");
    assert.equal(conflictoCliente.status, 3);
    assert.equal(solicitudesRecibidas.length, 0);
    assert.deepEqual(
      (await estados([vehiculoClienteInexistente])).map((evento) => [
        evento.estado,
        evento.intentos,
        evento.ultimo_error,
      ]),
      [[
        "conflicto",
        1,
        "Referencia sin equivalente remoto: cliente 1501",
      ]],
    );
    await borrarEventos();

    solicitudesRecibidas.length = 0;
    const abonoCreditoAntiguo = await insertarEvento({
      nombre: "abono-credito-compartido",
      entidad: "abono_credito",
      entidadId: "70",
      metodo: "POST",
      endpoint: "/creditos/{creditoId}/abono",
      referenciasEndpoint: [{
        marcador: "{creditoId}",
        entidad: "credito",
        valorLocal: "5",
      }],
      cuerpo: { valorAbono: 10, lineas: [] },
    });
    postCount = 0;
    const creditoCompartido = await ejecutarScript("sincronizar-local.ts");
    assert.equal(
      creditoCompartido.status,
      0,
      `${creditoCompartido.stdout}\n${creditoCompartido.stderr}`,
    );
    assert.deepEqual(
      solicitudesRecibidas.map(({ endpoint }) => endpoint),
      ["/creditos/5/abono"],
    );
    assert.equal((await estados([abonoCreditoAntiguo]))[0]?.estado, "sincronizado");
    await borrarEventos();

    solicitudesRecibidas.length = 0;
    const borrarVehiculoAntiguo = await insertarEvento({
      nombre: "delete-vehiculo-parent-e-id-propio",
      entidad: "vehiculo",
      entidadId: "20",
      metodo: "DELETE",
      endpoint: "/clientes/{clienteId}/vehiculos/{id}",
      referenciasEndpoint: referenciaCliente("5"),
      cuerpo: {},
    });
    deleteCount = 0;
    conflictoCount = 0;
    const deleteVehiculo = await ejecutarScript("sincronizar-local.ts");
    assert.equal(
      deleteVehiculo.status,
      0,
      `${deleteVehiculo.stdout}\n${deleteVehiculo.stderr}`,
    );
    assert.deepEqual(
      solicitudesRecibidas.map(({ metodo, endpoint }) => [metodo, endpoint]),
      [["DELETE", "/clientes/5/vehiculos/20"]],
    );
    assert.equal((await estados([borrarVehiculoAntiguo]))[0]?.estado, "sincronizado");
    await borrarEventos();
    await pool.query(
      `DELETE FROM referencias_sincronizacion
        WHERE (entidad, id_local) IN (
          ('venta', '13'), ('producto', '3501'), ('cliente', '1503')
        )`,
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
      [idPutNoExistente, "/ventas/12"],
    );
    await pool.query(
      `INSERT INTO referencias_sincronizacion (entidad, id_local, id_remoto)
       VALUES ('venta', '12', '777')
       ON CONFLICT (entidad, id_local) DO UPDATE SET id_remoto = EXCLUDED.id_remoto`,
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
      endpoint: "/ventas/777",
      entidad: null,
      entidadId: null,
    });
    await borrarEventos();
    await pool.query(
      "DELETE FROM referencias_sincronizacion WHERE entidad = 'venta' AND id_local = '12'",
    );

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
      endpoint: "/ventas/12?a=1",
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
    await pool.query("DELETE FROM base_sincronizacion");
    for (const baseline of baseAnterior.rows) {
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
    await pool.query(
      `DELETE FROM referencias_sincronizacion
        WHERE (entidad, id_local) IN (${valoresReferenciasSql()})`,
      referenciasDePrueba.flat(),
    );
    for (const referencia of referenciasAnteriores.rows) {
      await pool.query(
        `INSERT INTO referencias_sincronizacion (entidad, id_local, id_remoto)
         VALUES ($1, $2, $3)`,
        [referencia.entidad, referencia.id_local, referencia.id_remoto],
      );
    }
    await new Promise<void>((resolveClose, reject) => {
      server.close((error) => (error ? reject(error) : resolveClose()));
    });
    await pool.end();
  }
});
