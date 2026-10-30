import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import pg from "pg";
import test from "node:test";
import { TABLAS_HUELLA } from "@workspace/db/schema";

const localUrl = process.env.SYNC_TEST_DATABASE_LOCAL;
const remoteUrl = process.env.SYNC_TEST_DATABASE_REMOTE;
if (!localUrl || !remoteUrl) {
  throw new Error(
    "Define SYNC_TEST_DATABASE_LOCAL y SYNC_TEST_DATABASE_REMOTE con las dos bases locales aisladas",
  );
}
const { Pool } = pg;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const scriptsRoot = join(repoRoot, "scripts");
const apiEntry = join(repoRoot, "artifacts", "api-server", "dist", "index.mjs");
const token = randomBytes(32).toString("hex");
const prefix = `SYNC-E2E-${randomUUID()}`;

type CreditResponse = {
  id: number;
  recursoId?: number;
  yaProcesado?: boolean;
  lineas: Array<{
    id: number;
    productoNombre: string;
    cantidad: number;
    precioVenta: number;
    precioCompra: number;
  }>;
  _syncNuevoAbonoId?: number;
  _syncVentasGeneradas?: Array<{ id: number }>;
};

function assertTestDatabase(databaseUrl: string, expectedName: string): void {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.slice(1);
  if (
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname) ||
    databaseName !== expectedName
  ) {
    throw new Error(
      `E2E bloqueado: se requiere una base loopback ${expectedName}`,
    );
  }
}

function childEnv(values: Record<string, string>): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    USERPROFILE: process.env.USERPROFILE,
    NODE_ENV: "test",
    TZ: "UTC",
    ...values,
  };
}

async function puertoLibre(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
  return port;
}

async function desplazarSecuencias(pool: pg.Pool, desplazamiento: bigint): Promise<void> {
  for (const tabla of TABLAS_HUELLA) {
    const resultado = await pool.query<{
      secuencia: string | null;
      maximo: string;
    }>(
      `SELECT pg_get_serial_sequence($1, 'id') AS secuencia,
              COALESCE(MAX(id), 0)::text AS maximo
         FROM "${tabla}"`,
      [tabla],
    );
    const secuencia = resultado.rows[0]?.secuencia;
    assert.ok(secuencia, `La tabla ${tabla} no tiene secuencia para id`);
    const siguiente = BigInt(resultado.rows[0]!.maximo) + desplazamiento;
    await pool.query("SELECT setval($1::regclass, $2::bigint, true)", [
      secuencia,
      siguiente.toString(),
    ]);
  }
}

async function iniciarApi(
  databaseUrl: string,
  port: number,
  capturarRemoto: boolean,
): Promise<ChildProcess> {
  const apiDatabaseUrl = new URL(databaseUrl);
  apiDatabaseUrl.searchParams.set("options", "-c timezone=UTC");
  const child = spawn(process.execPath, ["--enable-source-maps", apiEntry], {
    cwd: repoRoot,
    env: childEnv({
      DATABASE_URL: apiDatabaseUrl.toString(),
      PORT: String(port),
      SYNC_TOKEN: token,
      DISABLE_BACKGROUND_JOBS: "true",
      ...(capturarRemoto ? { SYNC_CAPTURE_REMOTE: "true" } : {}),
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output = `${output}${chunk.toString()}`.slice(-3000);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output = `${output}${chunk.toString()}`.slice(-3000);
  });

  const healthUrl = `http://127.0.0.1:${port}/api/healthz`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) {
      throw new Error(`El servidor E2E terminó al iniciar: ${output}`);
    }
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return child;
    } catch {
      await delay(100);
    }
  }
  child.kill();
  throw new Error(`El servidor E2E no quedó disponible: ${output}`);
}

function detenerApi(child: ChildProcess | undefined): void {
  if (child && child.exitCode === null) child.kill();
}

async function api<T>(
  baseUrl: string,
  endpoint: string,
  method: string,
  body?: unknown,
  operationId?: string,
  syncRequest = false,
): Promise<T> {
  const response = await fetch(`${baseUrl}/api${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(operationId ? { "X-Operation-Id": operationId } : {}),
      ...(syncRequest
        ? {
            "X-Sync-Token": token,
            "X-Sync-Apply": "true",
          }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  assert.ok(
    response.ok,
    `${method} ${endpoint}: HTTP ${response.status} ${JSON.stringify(result)}`,
  );
  return result as T;
}

async function apiExcel<T>(
  baseUrl: string,
  endpoint: string,
  buffer: Buffer,
  operationId: string,
): Promise<T> {
  const form = new FormData();
  form.append(
    "archivo",
    new Blob([Uint8Array.from(buffer)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "inventario.xlsx",
  );
  const response = await fetch(`${baseUrl}/api${endpoint}`, {
    method: "POST",
    headers: { "X-Operation-Id": operationId },
    body: form,
  });
  const result = await response.json();
  assert.ok(
    response.ok,
    `POST ${endpoint}: HTTP ${response.status} ${JSON.stringify(result)}`,
  );
  return result as T;
}

async function inventarioExcel(
  productos: Array<{
    codigo: string;
    nombre: string;
    precioCompra?: number;
    precioVenta?: number;
    cantidad?: number | null;
  }>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Productos").addRows([
    [
      "CODIGO",
      "NOMBRE",
      "REFERENCIA",
      "REFERENCIA 2",
      "MARCA",
      "SE COMPRA",
      "SE VENDE A",
      "CANTIDAD",
    ],
    ...productos.map((producto) => [
      producto.codigo,
      producto.nombre,
      null,
      null,
      null,
      producto.precioCompra ?? 10000,
      producto.precioVenta ?? 15000,
      producto.cantidad ?? null,
    ]),
  ]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function ejecutarScript(
  archivo: string,
  variables: Record<string, string>,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", join("src", archivo)],
    {
      cwd: scriptsRoot,
      env: childEnv(variables),
      encoding: "utf8",
      timeout: 60_000,
    },
  );
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function esperar(
  comprobar: () => Promise<boolean>,
  mensaje: string,
): Promise<void> {
  for (let intento = 0; intento < 50; intento++) {
    if (await comprobar()) return;
    await delay(100);
  }
  throw new Error(mensaje);
}

test("sincroniza créditos, líneas y abonos en ambas direcciones; confirma retención y atomicidad", async () => {
  assert.ok(localUrl && remoteUrl);
  assertTestDatabase(localUrl, "investillo_sync_local");
  assertTestDatabase(remoteUrl, "investillo_sync_remote");

  const localPool = new Pool({ connectionString: localUrl });
  const remotePool = new Pool({ connectionString: remoteUrl });
  let localPort = 0;
  let remotePort = 0;
  let localApi: ChildProcess | undefined;
  let remoteApi: ChildProcess | undefined;
  const localBase = () => `http://127.0.0.1:${localPort}`;
  const remoteBase = () => `http://127.0.0.1:${remotePort}`;
  const scriptEnv = (databaseUrl: string) => ({
    DATABASE_URL: databaseUrl,
    SYNC_REMOTE_API_URL: `${remoteBase()}/api`,
    SYNC_TEST_ALLOW_LOCAL_HTTP: "true",
    SYNC_TOKEN: token,
    SYNC_PAGE_SIZE: "2",
    PORT: String(localPort),
  });

  let errorPrueba: unknown;
  let huboErrorPrueba = false;
  const erroresLimpieza: unknown[] = [];

  try {
    await Promise.all(
      [localPool, remotePool].map((pool) =>
        pool.query(
          `ALTER TABLE cursos_sincronizacion
               ADD COLUMN IF NOT EXISTS operacion_id text;
             CREATE TABLE IF NOT EXISTS base_sincronizacion (
               tabla text PRIMARY KEY,
               total bigint NOT NULL,
               maximo_id bigint NOT NULL,
               creado_en timestamp NOT NULL DEFAULT now()
             );
             DELETE FROM eventos_sincronizacion;
             DELETE FROM operaciones_sincronizadas;
             DELETE FROM referencias_sincronizacion;
             DELETE FROM cursos_sincronizacion;
             CREATE UNIQUE INDEX IF NOT EXISTS referencias_sincronizacion_entidad_remoto_uidx
               ON referencias_sincronizacion (entidad, id_remoto);`,
        ),
      ),
    );
    localPort = await puertoLibre();
    remotePort = await puertoLibre();
    localApi = await iniciarApi(localUrl, localPort, false);
    remoteApi = await iniciarApi(remoteUrl, remotePort, true);

    const sinCursor = ejecutarScript(
      "sincronizar-remoto.ts",
      scriptEnv(localUrl),
    );
    assert.notEqual(sinCursor.status, 0);
    assert.match(
      `${sinCursor.stdout}\n${sinCursor.stderr}`,
      /pnpm run sync:init/,
    );
    const datosSinCursor = await localPool.query(
      `SELECT 1 FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
    );
    const clientesSinCursor = await localPool.query(
      `SELECT 1 FROM clientes WHERE nombre LIKE $1`,
      [`${prefix}%`],
    );
    const acuseSinCursor = await remotePool.query(
      `SELECT 1 FROM cursos_sincronizacion WHERE nombre = 'acuse_local'`,
    );
    assert.equal(datosSinCursor.rowCount, 0);
    assert.equal(clientesSinCursor.rowCount, 0);
    assert.equal(acuseSinCursor.rowCount, 0);

    const [maxClientesLocal, maxClientesRemoto] = await Promise.all([
      localPool.query<{ maximo: number }>(
        "SELECT COALESCE(MAX(id), 0)::int AS maximo FROM clientes",
      ),
      remotePool.query<{ maximo: number }>(
        "SELECT COALESCE(MAX(id), 0)::int AS maximo FROM clientes",
      ),
    ]);
    const clienteCompartidoId =
      Math.max(
        maxClientesLocal.rows[0]?.maximo ?? 0,
        maxClientesRemoto.rows[0]?.maximo ?? 0,
      ) + 1;
    await Promise.all(
      [localPool, remotePool].map(async (pool) => {
        await pool.query(
          "INSERT INTO clientes (id, nombre) VALUES ($1, $2)",
          [clienteCompartidoId, `${prefix}-cliente-compartido`],
        );
        await pool.query(
          `SELECT setval(
             pg_get_serial_sequence('clientes', 'id'),
             $1,
             true
           )`,
          [clienteCompartidoId],
        );
      }),
    );

    const inicializa = ejecutarScript(
      "iniciar-sincronizacion.ts",
      scriptEnv(localUrl),
    );
    assert.equal(inicializa.status, 0, inicializa.stderr || inicializa.stdout);
    const cursorInicial = await localPool.query<{
      valor: string;
      operacion_id: string | null;
    }>(
      `SELECT valor::text AS valor, operacion_id
           FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
    );
    assert.equal(cursorInicial.rows[0]?.operacion_id, null);
    const inicializaOtraVez = ejecutarScript(
      "iniciar-sincronizacion.ts",
      scriptEnv(localUrl),
    );
    assert.equal(
      inicializaOtraVez.status,
      0,
      inicializaOtraVez.stderr || inicializaOtraVez.stdout,
    );
    const cursorSinPisar = await localPool.query<{
      valor: string;
      operacion_id: string | null;
    }>(
      `SELECT valor::text AS valor, operacion_id
           FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
    );
    assert.deepEqual(cursorSinPisar.rows[0], cursorInicial.rows[0]);

    await Promise.all([
      desplazarSecuencias(localPool, 1_000_000n),
      desplazarSecuencias(remotePool, 2_000_000n),
    ]);

    const vehiculoClienteAntiguo = await api<{ id: number }>(
      localBase(),
      `/clientes/${clienteCompartidoId}/vehiculos`,
      "POST",
      {
        placa: `${prefix}-PLACA-CLIENTE-COMPARTIDO`,
        descripcion: "Vehículo de cliente común previo al punto de partida",
      },
      `${prefix}-vehiculo-cliente-compartido`,
    );
    const sincronizaVehiculoClienteAntiguo = ejecutarScript(
      "sincronizar-local.ts",
      scriptEnv(localUrl),
    );
    assert.equal(
      sincronizaVehiculoClienteAntiguo.status,
      0,
      sincronizaVehiculoClienteAntiguo.stderr ||
        sincronizaVehiculoClienteAntiguo.stdout,
    );
    const vehiculoClienteRemoto = await remotePool.query<{
      cliente_id: number;
      placa: string;
    }>(
      `SELECT cliente_id, placa FROM vehiculos_cliente
        WHERE placa = $1 AND cliente_id = $2`,
      [
        `${prefix}-PLACA-CLIENTE-COMPARTIDO`,
        clienteCompartidoId,
      ],
    );
    assert.equal(vehiculoClienteRemoto.rowCount, 1);
    assert.equal(
      vehiculoClienteRemoto.rows[0]?.cliente_id,
      clienteCompartidoId,
    );
    assert.equal(
      vehiculoClienteRemoto.rows[0]?.placa,
      `${prefix}-PLACA-CLIENTE-COMPARTIDO`,
    );
    assert.ok(vehiculoClienteAntiguo.id > 0);

    const clienteLocalA = await api<{ id: number }>(
      localBase(),
      "/clientes",
      "POST",
      { nombre: `${prefix}-cliente-mapeo-a` },
      `${prefix}-cliente-mapeo-a`,
    );
    const clienteLocalB = await api<{ id: number }>(
      localBase(),
      "/clientes",
      "POST",
      { nombre: `${prefix}-cliente-mapeo-b` },
      `${prefix}-cliente-mapeo-b`,
    );
    const sincronizaClientesMapeados = ejecutarScript(
      "sincronizar-local.ts",
      scriptEnv(localUrl),
    );
    assert.equal(
      sincronizaClientesMapeados.status,
      0,
      sincronizaClientesMapeados.stderr ||
        sincronizaClientesMapeados.stdout,
    );
    const mapeosClientes = await localPool.query<{
      id_local: string;
      id_remoto: string;
    }>(
      `SELECT id_local, id_remoto FROM referencias_sincronizacion
        WHERE entidad = 'cliente' AND id_local = ANY($1::text[])`,
      [[String(clienteLocalA.id), String(clienteLocalB.id)]],
    );
    assert.equal(mapeosClientes.rowCount, 2);
    assert.notEqual(
      mapeosClientes.rows[0]?.id_remoto,
      mapeosClientes.rows[1]?.id_remoto,
    );
    const relacionClienteB = mapeosClientes.rows.find(
      (relacion) => relacion.id_local === String(clienteLocalB.id),
    );
    assert.ok(relacionClienteB);
    await assert.rejects(
      localPool.query(
        `INSERT INTO referencias_sincronizacion (entidad, id_local, id_remoto)
         VALUES ('cliente', $1, $2)`,
        [`${prefix}-cliente-duplicado`, relacionClienteB.id_remoto],
      ),
      (error: unknown) =>
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505",
    );
    await api(
      remoteBase(),
      `/clientes/${relacionClienteB.id_remoto}`,
      "PUT",
      { nombre: `${prefix}-cliente-remoto-editado` },
      `${prefix}-cliente-remoto-editado`,
    );
    await esperar(async () => {
      const eventoRemoto = await remotePool.query(
        `SELECT 1 FROM eventos_sincronizacion
          WHERE operation_id = $1 AND origen = 'remoto'`,
        [`${prefix}-cliente-remoto-editado`],
      );
      return eventoRemoto.rowCount === 1;
    }, "El cambio del cliente no quedó registrado en Render");
    await delay(2_100);
    const descargaClienteEditado = ejecutarScript(
      "sincronizar-remoto.ts",
      scriptEnv(localUrl),
    );
    assert.equal(
      descargaClienteEditado.status,
      0,
      descargaClienteEditado.stderr || descargaClienteEditado.stdout,
    );
    const clientesEditados = await localPool.query<{
      id: number;
      nombre: string;
    }>(
      `SELECT id, nombre FROM clientes WHERE id = ANY($1::int[])`,
      [[clienteLocalA.id, clienteLocalB.id]],
    );
    assert.equal(
      clientesEditados.rows.find((cliente) => cliente.id === clienteLocalA.id)
        ?.nombre,
      `${prefix}-cliente-mapeo-a`,
    );
    assert.equal(
      clientesEditados.rows.find((cliente) => cliente.id === clienteLocalB.id)
        ?.nombre,
      `${prefix}-cliente-remoto-editado`,
    );
    const relacionClienteA = mapeosClientes.rows.find(
      (relacion) => relacion.id_local === String(clienteLocalA.id),
    );
    assert.ok(relacionClienteA);
    const cursorAntesDuplicado = await localPool.query<{
      valor: string;
      operacion_id: string | null;
    }>(
      `SELECT valor::text AS valor, operacion_id
         FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
    );
    await remotePool.query(
      `INSERT INTO eventos_sincronizacion
          (operation_id, entidad, entidad_id, tipo, metodo, endpoint, payload,
           origen, estado, creado_en)
         VALUES ($1, 'cliente', $2, 'crear', 'POST', '/clientes',
                 jsonb_build_object('nombre', $3::text),
                 'remoto', 'sincronizado', now() AT TIME ZONE 'UTC')`,
      [
        `${prefix}-cliente-duplicado-remoto`,
        relacionClienteA.id_remoto,
        `${prefix}-cliente-duplicado-remoto`,
      ],
    );
    await delay(2_100);
    const pullDuplicadoUrl = new URL(`${remoteBase()}/api/sync/pull`);
    pullDuplicadoUrl.searchParams.set(
      "desde",
      cursorAntesDuplicado.rows[0]!.valor,
    );
    if (cursorAntesDuplicado.rows[0]!.operacion_id) {
      pullDuplicadoUrl.searchParams.set(
        "desdeOperacion",
        cursorAntesDuplicado.rows[0]!.operacion_id!,
      );
    }
    const pullDuplicado = await fetch(pullDuplicadoUrl, {
      headers: { "X-Sync-Token": token },
    });
    assert.equal(pullDuplicado.ok, true);
    const paginaDuplicado = (await pullDuplicado.json()) as {
      eventos: Array<{ operationId: string }>;
    };
    assert.ok(
      paginaDuplicado.eventos.some(
        (evento) =>
          evento.operationId === `${prefix}-cliente-duplicado-remoto`,
      ),
      `El evento de equivalencia duplicada no apareció en /sync/pull desde ${JSON.stringify(cursorAntesDuplicado.rows[0])}`,
    );
    const equivalenciaDuplicada = ejecutarScript(
      "sincronizar-remoto.ts",
      scriptEnv(localUrl),
    );
    assert.notEqual(
      equivalenciaDuplicada.status,
      0,
      `${equivalenciaDuplicada.stdout}\n${equivalenciaDuplicada.stderr}`,
    );
    assert.match(
      `${equivalenciaDuplicada.stdout}\n${equivalenciaDuplicada.stderr}`,
      /No se pudo guardar la equivalencia: ese ID remoto ya está asignado/,
    );
    const cursorTrasDuplicado = await localPool.query<{
      valor: string;
      operacion_id: string | null;
    }>(
      `SELECT valor::text AS valor, operacion_id
         FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
    );
    assert.deepEqual(cursorTrasDuplicado.rows[0], cursorAntesDuplicado.rows[0]);
    await remotePool.query(
      "DELETE FROM eventos_sincronizacion WHERE operation_id = $1",
      [`${prefix}-cliente-duplicado-remoto`],
    );
    await remotePool.query(
      "DELETE FROM eventos_sincronizacion WHERE operation_id = $1",
      [`${prefix}-cliente-remoto-editado`],
    );

    const productoSombra = await api<{ id: number }>(
      remoteBase(),
      "/inventario",
      "POST",
      {
        nombre: `${prefix}-producto-remoto-sombra`,
        codigo: `${prefix}-COD-SOMBRA`,
        precioCompra: 10000,
        precioVentaSinIva: 15000,
        tieneIva: false,
        stockActual: 10,
        stockMinimo: 0,
      },
      `${prefix}-producto-remoto-sombra`,
      true,
    );
    const productoLocal = await api<{
      id: number;
      nombre: string;
      codigo: string;
      marca: string | null;
    }>(
      localBase(),
      "/inventario",
      "POST",
      {
        nombre: `${prefix}-producto-local`,
        codigo: `${prefix}-COD-LOCAL`,
        precioCompra: 10000,
        precioVentaSinIva: 15000,
        tieneIva: false,
        stockActual: 10,
        stockMinimo: 0,
      },
      `${prefix}-producto-local`,
    );
    const sincronizaProducto = ejecutarScript(
      "sincronizar-local.ts",
      scriptEnv(localUrl),
    );
    assert.equal(
      sincronizaProducto.status,
      0,
      sincronizaProducto.stderr || sincronizaProducto.stdout,
    );
    await api<{ id: number }>(
      localBase(),
      "/ventas",
      "POST",
      {
        fecha: new Date().toISOString().slice(0, 10),
        referencia: `${prefix}-venta-producto-local`,
        tipoLinea: "venta",
        productoId: productoLocal.id,
        productoNombre: productoLocal.nombre,
        productoCodigo: productoLocal.codigo,
        productoMarca: productoLocal.marca,
        cantidad: 1,
        precioCompraUnidad: 10000,
        precioVentaUnidad: 15000,
        precioVentaTotal: 15000,
        beneficio: 5000,
      },
      `${prefix}-venta-producto-local`,
    );
    const sincronizaVentaProducto = ejecutarScript(
      "sincronizar-local.ts",
      scriptEnv(localUrl),
    );
    assert.equal(
      sincronizaVentaProducto.status,
      0,
      sincronizaVentaProducto.stderr || sincronizaVentaProducto.stdout,
    );
    const ventaProductoRemota = await remotePool.query<{
      producto_id: number;
      nombre: string;
    }>(
      `SELECT venta.producto_id, producto.nombre
         FROM ventas_diarias venta
         JOIN productos producto ON producto.id = venta.producto_id
        WHERE venta.referencia = $1`,
      [`${prefix}-venta-producto-local`],
    );
    assert.equal(ventaProductoRemota.rowCount, 1);
    assert.equal(
      ventaProductoRemota.rows[0]?.nombre,
      `${prefix}-producto-local`,
    );
    assert.notEqual(
      productoLocal.id,
      ventaProductoRemota.rows[0]?.producto_id,
      "La secuencia local y la remota deben divergir para el producto sincronizado",
    );
    assert.notEqual(ventaProductoRemota.rows[0]?.producto_id, productoSombra.id);

    const codigoProductoCompartido = `${prefix}-COD-IMPORT-COMPARTIDO`;
    const productoCompartidoRemoto = await api<{
      id: number;
      nombre: string;
      codigo: string;
      marca: string | null;
    }>(
      remoteBase(),
      "/inventario",
      "POST",
      {
        nombre: `${prefix}-producto-importado-compartido`,
        codigo: codigoProductoCompartido,
        precioCompra: 10000,
        precioVentaSinIva: 15000,
        tieneIva: false,
        stockActual: 10,
        stockMinimo: 0,
      },
      `${prefix}-producto-importado-compartido-remoto`,
      true,
    );
    const importacionProductoLocal = await api<{
      _syncProductos: Array<{ codigo: string; id: number }>;
    }>(
      localBase(),
      "/inventario-import/confirmar-nuevos",
      "POST",
      {
        items: [
          {
            codigo: codigoProductoCompartido,
            nombre: productoCompartidoRemoto.nombre,
            referencia: null,
            marca: null,
            precioCompra: "10000",
            precioVentaSinIva: "15000",
            precioVentaConIva: "17850",
            cantidad: 10,
          },
        ],
      },
      `${prefix}-importar-producto-compartido-local`,
    );
    const productoCompartidoLocal = importacionProductoLocal._syncProductos[0];
    assert.ok(productoCompartidoLocal);
    assert.notEqual(productoCompartidoLocal.id, productoCompartidoRemoto.id);
    await delay(2_100);
    const sincronizaProductoImportado = ejecutarScript(
      "sincronizar-local.ts",
      scriptEnv(localUrl),
    );
    assert.equal(
      sincronizaProductoImportado.status,
      0,
      sincronizaProductoImportado.stderr || sincronizaProductoImportado.stdout,
    );
    const equivalenciaProductoImportado = await localPool.query<{
      id_remoto: string;
    }>(
      `SELECT id_remoto FROM referencias_sincronizacion
        WHERE entidad = 'producto' AND id_local = $1`,
      [String(productoCompartidoLocal.id)],
    );
    assert.equal(
      equivalenciaProductoImportado.rows[0]?.id_remoto,
      String(productoCompartidoRemoto.id),
    );
    const productoReintentado = await api<{
      yaProcesado?: boolean;
    }>(
      localBase(),
      "/inventario-import/confirmar-nuevos",
      "POST",
      {
        items: [
          {
            codigo: codigoProductoCompartido,
            nombre: productoCompartidoRemoto.nombre,
            referencia: null,
            marca: null,
            precioCompra: "10000",
            precioVentaSinIva: "15000",
            precioVentaConIva: "17850",
            cantidad: 10,
          },
        ],
      },
      `${prefix}-importar-producto-compartido-local`,
    );
    assert.equal(productoReintentado.yaProcesado, true);
    const equivalenciasProductoReintentado = await localPool.query(
      `SELECT 1 FROM referencias_sincronizacion
        WHERE entidad = 'producto' AND id_local = $1 AND id_remoto = $2`,
      [
        String(productoCompartidoLocal.id),
        String(productoCompartidoRemoto.id),
      ],
    );
    assert.equal(equivalenciasProductoReintentado.rowCount, 1);
    const productosCompartidos = await remotePool.query(
      "SELECT id FROM productos WHERE codigo = $1",
      [codigoProductoCompartido],
    );
    assert.equal(
      productosCompartidos.rowCount,
      1,
      "El producto existente por codigo no debe duplicarse en el remoto",
    );

    const importacionClienteLocal = await api<{
      _syncClientes: Array<{ nombre: string; id: number }>;
    }>(
      localBase(),
      "/clientes-import/resolver-telefonos",
      "POST",
      {
        items: [
          {
            nombre: `${prefix}-cliente-importado-local`,
            telefono: null,
            telefono2: null,
            correo: null,
            notas: null,
          },
        ],
      },
      `${prefix}-importar-cliente-local`,
    );
    const clienteImportadoLocal = importacionClienteLocal._syncClientes[0];
    assert.ok(clienteImportadoLocal);
    await delay(2_100);
    const sincronizaClienteImportado = ejecutarScript(
      "sincronizar-local.ts",
      scriptEnv(localUrl),
    );
    assert.equal(
      sincronizaClienteImportado.status,
      0,
      sincronizaClienteImportado.stderr || sincronizaClienteImportado.stdout,
    );
    const equivalenciaClienteImportado = await localPool.query<{
      id_remoto: string;
    }>(
      `SELECT id_remoto FROM referencias_sincronizacion
        WHERE entidad = 'cliente' AND id_local = $1`,
      [String(clienteImportadoLocal.id)],
    );
    assert.ok(equivalenciaClienteImportado.rows[0]?.id_remoto);
    const clienteReintentado = await api<{
      yaProcesado?: boolean;
    }>(
      localBase(),
      "/clientes-import/resolver-telefonos",
      "POST",
      {
        items: [
          {
            nombre: `${prefix}-cliente-importado-local`,
            telefono: null,
            telefono2: null,
            correo: null,
            notas: null,
          },
        ],
      },
      `${prefix}-importar-cliente-local`,
    );
    assert.equal(clienteReintentado.yaProcesado, true);
    const equivalenciasClienteReintentado = await localPool.query(
      `SELECT 1 FROM referencias_sincronizacion
        WHERE entidad = 'cliente' AND id_local = $1 AND id_remoto = $2`,
      [
        String(clienteImportadoLocal.id),
        equivalenciaClienteImportado.rows[0]?.id_remoto,
      ],
    );
    assert.equal(equivalenciasClienteReintentado.rowCount, 1);

    await api(
      localBase(),
      "/ventas",
      "POST",
      {
        fecha: new Date().toISOString().slice(0, 10),
        referencia: `${prefix}-venta-producto-importado-local`,
        tipoLinea: "venta",
        productoId: productoCompartidoLocal.id,
        productoNombre: productoCompartidoRemoto.nombre,
        productoCodigo: codigoProductoCompartido,
        productoMarca: productoCompartidoRemoto.marca,
        cantidad: 1,
        precioCompraUnidad: 10000,
        precioVentaUnidad: 15000,
        precioVentaTotal: 15000,
        beneficio: 5000,
      },
      `${prefix}-venta-producto-importado-local`,
    );
    await api(
      localBase(),
      `/clientes/${clienteImportadoLocal.id}/vehiculos`,
      "POST",
      { placa: `${prefix}-PLACA-CLIENTE-IMPORTADO-LOCAL` },
      `${prefix}-vehiculo-cliente-importado-local`,
    );
    await delay(2_100);
    const sincronizaUsoImportadoLocal = ejecutarScript(
      "sincronizar-local.ts",
      scriptEnv(localUrl),
    );
    assert.equal(
      sincronizaUsoImportadoLocal.status,
      0,
      sincronizaUsoImportadoLocal.stderr || sincronizaUsoImportadoLocal.stdout,
    );
    const ventaImportadaRemota = await remotePool.query<{
      producto_id: number;
    }>(
      `SELECT producto_id FROM ventas_diarias WHERE referencia = $1`,
      [`${prefix}-venta-producto-importado-local`],
    );
    assert.equal(ventaImportadaRemota.rows[0]?.producto_id, productoCompartidoRemoto.id);
    const vehiculoClienteImportadoRemoto = await remotePool.query<{
      cliente_id: number;
    }>(
      `SELECT cliente_id FROM vehiculos_cliente
        WHERE placa = $1`,
      [`${prefix}-PLACA-CLIENTE-IMPORTADO-LOCAL`],
    );
    assert.equal(
      vehiculoClienteImportadoRemoto.rows[0]?.cliente_id,
      Number(equivalenciaClienteImportado.rows[0]?.id_remoto),
    );

    const codigoProductoImportadoRemoto = `${prefix}-COD-IMPORT-REMOTO`;
    const importacionProductoRemoto = await api<{
      _syncProductos: Array<{ codigo: string; id: number }>;
    }>(
      remoteBase(),
      "/inventario-import/confirmar-nuevos",
      "POST",
      {
        items: [
          {
            codigo: codigoProductoImportadoRemoto,
            nombre: `${prefix}-producto-importado-remoto`,
            referencia: null,
            marca: null,
            precioCompra: "10000",
            precioVentaSinIva: "15000",
            precioVentaConIva: "17850",
            cantidad: 10,
          },
        ],
      },
      `${prefix}-importar-producto-remoto`,
    );
    const productoImportadoRemoto = importacionProductoRemoto._syncProductos[0];
    assert.ok(productoImportadoRemoto);
    const importacionClienteRemoto = await api<{
      _syncClientes: Array<{ nombre: string; id: number }>;
    }>(
      remoteBase(),
      "/clientes-import/resolver-telefonos",
      "POST",
      {
        items: [
          {
            nombre: `${prefix}-cliente-importado-remoto`,
            telefono: null,
            telefono2: null,
            correo: null,
            notas: null,
          },
        ],
      },
      `${prefix}-importar-cliente-remoto`,
    );
    const clienteImportadoRemoto = importacionClienteRemoto._syncClientes[0];
    assert.ok(clienteImportadoRemoto);
    await delay(2_100);
    const descargaImportaciones = ejecutarScript(
      "sincronizar-remoto.ts",
      scriptEnv(localUrl),
    );
    assert.equal(
      descargaImportaciones.status,
      0,
      descargaImportaciones.stderr || descargaImportaciones.stdout,
    );
    const [equivalenciaProductoRemoto, equivalenciaClienteRemoto] =
      await Promise.all([
        localPool.query<{ id_local: string }>(
          `SELECT id_local FROM referencias_sincronizacion
            WHERE entidad = 'producto' AND id_remoto = $1`,
          [String(productoImportadoRemoto.id)],
        ),
        localPool.query<{ id_local: string }>(
          `SELECT id_local FROM referencias_sincronizacion
            WHERE entidad = 'cliente' AND id_remoto = $1`,
          [String(clienteImportadoRemoto.id)],
        ),
      ]);
    assert.ok(equivalenciaProductoRemoto.rows[0]?.id_local);
    assert.ok(equivalenciaClienteRemoto.rows[0]?.id_local);
    assert.notEqual(
      Number(equivalenciaProductoRemoto.rows[0]?.id_local),
      productoImportadoRemoto.id,
    );
    assert.notEqual(
      Number(equivalenciaClienteRemoto.rows[0]?.id_local),
      clienteImportadoRemoto.id,
    );

    await api(
      localBase(),
      "/ventas",
      "POST",
      {
        fecha: new Date().toISOString().slice(0, 10),
        referencia: `${prefix}-venta-producto-importado-remoto`,
        tipoLinea: "venta",
        productoId: Number(equivalenciaProductoRemoto.rows[0]?.id_local),
        productoNombre: `${prefix}-producto-importado-remoto`,
        productoCodigo: codigoProductoImportadoRemoto,
        cantidad: 1,
        precioCompraUnidad: 10000,
        precioVentaUnidad: 15000,
        precioVentaTotal: 15000,
        beneficio: 5000,
      },
      `${prefix}-venta-producto-importado-remoto`,
    );
    await api(
      localBase(),
      `/clientes/${equivalenciaClienteRemoto.rows[0]?.id_local}/vehiculos`,
      "POST",
      { placa: `${prefix}-PLACA-CLIENTE-IMPORTADO-REMOTO` },
      `${prefix}-vehiculo-cliente-importado-remoto`,
    );
    await delay(2_100);
    const sincronizaUsoImportadoRemoto = ejecutarScript(
      "sincronizar-local.ts",
      scriptEnv(localUrl),
    );
    assert.equal(
      sincronizaUsoImportadoRemoto.status,
      0,
      sincronizaUsoImportadoRemoto.stderr || sincronizaUsoImportadoRemoto.stdout,
    );
    const ventaProductoRemotoImportado = await remotePool.query<{
      producto_id: number;
    }>(
      `SELECT producto_id FROM ventas_diarias WHERE referencia = $1`,
      [`${prefix}-venta-producto-importado-remoto`],
    );
    assert.equal(
      ventaProductoRemotoImportado.rows[0]?.producto_id,
      productoImportadoRemoto.id,
    );
    const vehiculoClienteRemotoImportado = await remotePool.query<{
      cliente_id: number;
    }>(
      `SELECT cliente_id FROM vehiculos_cliente WHERE placa = $1`,
      [`${prefix}-PLACA-CLIENTE-IMPORTADO-REMOTO`],
    );
    assert.equal(
      vehiculoClienteRemotoImportado.rows[0]?.cliente_id,
      clienteImportadoRemoto.id,
    );
    await remotePool.query(
      `DELETE FROM eventos_sincronizacion WHERE operation_id = ANY($1::text[])`,
      [
        [
          `${prefix}-importar-producto-remoto`,
          `${prefix}-importar-cliente-remoto`,
        ],
      ],
    );

    const codigoMultipartRemoto = `${prefix}-COD-MULTIPART-REMOTO`;
    const productoBaseMultipart = await api<{ id: number }>(
      remoteBase(),
      "/inventario",
      "POST",
      {
        nombre: `${prefix}-producto-multipart-original`,
        codigo: codigoMultipartRemoto,
        precioCompra: 10000,
        precioVentaSinIva: 15000,
        tieneIva: false,
        stockActual: 10,
        stockMinimo: 0,
      },
      `${prefix}-producto-multipart-original`,
      true,
    );
    const importacionMultipart = await apiExcel<{
      _syncProductos: Array<{ codigo: string; id: number | null }>;
    }>(
      remoteBase(),
      "/inventario-import",
      await inventarioExcel([{
        codigo: codigoMultipartRemoto,
        nombre: `${prefix}-producto-multipart-remoto`,
        cantidad: 10,
      }]),
      `${prefix}-importar-excel-remoto`,
    );
    assert.deepEqual(importacionMultipart._syncProductos, [
      { codigo: codigoMultipartRemoto, id: productoBaseMultipart.id },
    ]);
    await delay(2_100);
    const descargaExcelRemoto = ejecutarScript(
      "sincronizar-remoto.ts",
      scriptEnv(localUrl),
    );
    assert.equal(
      descargaExcelRemoto.status,
      0,
      descargaExcelRemoto.stderr || descargaExcelRemoto.stdout,
    );
    const productoMultipartLocal = await localPool.query<{ id: number }>(
      "SELECT id FROM productos WHERE codigo = $1 AND nombre = $2",
      [codigoMultipartRemoto, `${prefix}-producto-multipart-remoto`],
    );
    assert.equal(productoMultipartLocal.rowCount, 1);
    const equivalenciaMultipart = await localPool.query<{
      id_local: string;
      id_remoto: string;
    }>(
      `SELECT id_local, id_remoto FROM referencias_sincronizacion
        WHERE entidad = 'producto' AND id_remoto = $1`,
      [String(productoBaseMultipart.id)],
    );
    assert.equal(
      equivalenciaMultipart.rows[0]?.id_local,
      String(productoMultipartLocal.rows[0]?.id),
    );
    const eventoMultipart = await remotePool.query<{
      origen: string;
      estado: string;
      payload: { items?: unknown[] };
      referencias_respuesta: Array<{ campo: string }>;
    }>(
      `SELECT origen, estado, payload, referencias_respuesta
         FROM eventos_sincronizacion WHERE operation_id = $1`,
      [`${prefix}-importar-excel-remoto`],
    );
    assert.equal(eventoMultipart.rows[0]?.origen, "remoto");
    assert.equal(eventoMultipart.rows[0]?.estado, "sincronizado");
    assert.equal(eventoMultipart.rows[0]?.payload.items?.length, 1);
    assert.deepEqual(
      eventoMultipart.rows[0]?.referencias_respuesta.map(({ campo }) => campo),
      ["_syncProductos.0.id"],
    );
    await api(
      localBase(),
      "/ventas",
      "POST",
      {
        fecha: new Date().toISOString().slice(0, 10),
        referencia: `${prefix}-venta-producto-multipart-remoto`,
        tipoLinea: "venta",
        productoId: Number(productoMultipartLocal.rows[0]?.id),
        productoNombre: `${prefix}-producto-multipart-remoto`,
        productoCodigo: codigoMultipartRemoto,
        cantidad: 1,
        precioCompraUnidad: 10000,
        precioVentaUnidad: 15000,
        precioVentaTotal: 15000,
        beneficio: 5000,
      },
      `${prefix}-venta-producto-multipart-remoto`,
    );
    await delay(2_100);
    const sincronizaUsoMultipart = ejecutarScript(
      "sincronizar-local.ts",
      scriptEnv(localUrl),
    );
    assert.equal(
      sincronizaUsoMultipart.status,
      0,
      sincronizaUsoMultipart.stderr || sincronizaUsoMultipart.stdout,
    );
    const ventaMultipartRemota = await remotePool.query<{
      producto_id: number;
    }>(
      "SELECT producto_id FROM ventas_diarias WHERE referencia = $1",
      [`${prefix}-venta-producto-multipart-remoto`],
    );
    assert.equal(
      ventaMultipartRemota.rows[0]?.producto_id,
      productoBaseMultipart.id,
    );
    await remotePool.query(
      "DELETE FROM eventos_sincronizacion WHERE operation_id = $1",
      [`${prefix}-importar-excel-remoto`],
    );

    const productosAlineacion = [
      {
        codigo: `${prefix}-ALINEAR-A`,
        nombre: `${prefix}-producto-alinear-a`,
      },
      {
        codigo: `${prefix}-ALINEAR-FALTA`,
        nombre: `${prefix}-producto-alinear-falta`,
      },
      {
        codigo: `${prefix}-ALINEAR-C`,
        nombre: `${prefix}-producto-alinear-c`,
      },
    ];
    const productosAlineacionLocal: Array<{ codigo: string; id: number }> = [];
    for (const producto of productosAlineacion) {
      const creado = await api<{ id: number }>(
        localBase(),
        "/inventario",
        "POST",
        {
          nombre: producto.nombre,
          codigo: producto.codigo,
          precioCompra: 10000,
          precioVentaSinIva: 15000,
          tieneIva: false,
          stockActual: 10,
          stockMinimo: 0,
        },
        `${prefix}-seed-${producto.codigo}`,
        true,
      );
      productosAlineacionLocal.push({ ...producto, id: creado.id });
    }
    const codigoAusente = productosAlineacion[1]!.codigo;
    try {
      await remotePool.query(
        `DROP TRIGGER IF EXISTS sync_e2e_skip_missing_product ON productos;
         CREATE OR REPLACE FUNCTION sync_e2e_skip_missing_product()
         RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN
           IF NEW.codigo = '${codigoAusente}' THEN RETURN NULL; END IF;
           RETURN NEW;
         END $$;
         CREATE TRIGGER sync_e2e_skip_missing_product
         BEFORE INSERT ON productos FOR EACH ROW
         EXECUTE FUNCTION sync_e2e_skip_missing_product()`,
      );
      const operationAlineacion = `${prefix}-importar-excel-alineacion`;
      const importacionAlineacion = await apiExcel<{
        _syncProductos: Array<{ codigo: string; id: number | null }>;
      }>(
        localBase(),
        "/inventario-import",
        await inventarioExcel(productosAlineacion),
        operationAlineacion,
      );
      assert.equal(importacionAlineacion._syncProductos.length, 3);
      assert.ok(
        importacionAlineacion._syncProductos.every(
          (producto) => Number.isInteger(producto.id),
        ),
      );
      await delay(2_100);
      const sincronizaAlineacion = ejecutarScript(
        "sincronizar-local.ts",
        scriptEnv(localUrl),
      );
      assert.equal(
        sincronizaAlineacion.status,
        0,
        sincronizaAlineacion.stderr || sincronizaAlineacion.stdout,
      );
      assert.match(
        `${sincronizaAlineacion.stdout}\n${sincronizaAlineacion.stderr}`,
        /No se creó equivalencia para el producto .*_syncProductos\.1\.id/,
      );
      const equivalenciasAlineadas = await localPool.query<{
        id_local: string;
        id_remoto: string;
      }>(
        `SELECT id_local, id_remoto FROM referencias_sincronizacion
          WHERE entidad = 'producto' AND id_local = ANY($1::text[])`,
        [productosAlineacionLocal.map(({ id }) => String(id))],
      );
      assert.equal(equivalenciasAlineadas.rowCount, 2);
      for (const indice of [0, 2]) {
        const productoLocal = productosAlineacionLocal[indice]!;
        const productoRemoto = await remotePool.query<{ id: number }>(
          "SELECT id FROM productos WHERE codigo = $1",
          [productoLocal.codigo],
        );
        const equivalencia = equivalenciasAlineadas.rows.find(
          (relacion) => relacion.id_local === String(productoLocal.id),
        );
        assert.equal(productoRemoto.rowCount, 1);
        assert.equal(equivalencia?.id_remoto, String(productoRemoto.rows[0]?.id));
      }
      const equivalenciaAusente = equivalenciasAlineadas.rows.find(
        (relacion) =>
          relacion.id_local === String(productosAlineacionLocal[1]?.id),
      );
      assert.equal(equivalenciaAusente, undefined);
      const eventoAlineacion = await localPool.query<{ estado: string }>(
        "SELECT estado FROM eventos_sincronizacion WHERE operation_id = $1",
        [operationAlineacion],
      );
      assert.equal(eventoAlineacion.rows[0]?.estado, "sincronizado");
    } finally {
      await remotePool.query(
        `DROP TRIGGER IF EXISTS sync_e2e_skip_missing_product ON productos;
         DROP FUNCTION IF EXISTS sync_e2e_skip_missing_product()`,
      );
    }

    const [fechaGrupo] = await remotePool
      .query<{ fecha: string }>(
        `SELECT to_char(
           now() - interval '10 seconds',
           'YYYY-MM-DD HH24:MI:SS.US'
         ) AS fecha`,
      )
      .then((result) => result.rows);
    assert.ok(fechaGrupo);
    const idsGrupo = [
      `${prefix}-cursor-a`,
      `${prefix}-cursor-b`,
      `${prefix}-cursor-c`,
    ];
    const fechaCursorPrueba = await localPool.query<{ fecha: string }>(
      `SELECT to_char(
           $1::timestamp - interval '1 microsecond',
           'YYYY-MM-DD HH24:MI:SS.US'
         ) AS fecha`,
      [fechaGrupo.fecha],
    );
    await localPool.query(
      `UPDATE cursos_sincronizacion
            SET valor = $1::timestamp, operacion_id = NULL
          WHERE nombre = 'remoto'`,
      [fechaCursorPrueba.rows[0]?.fecha],
    );
    await remotePool.query(
      "DELETE FROM cursos_sincronizacion WHERE nombre = 'acuse_local'",
    );
    await remotePool.query(
      `INSERT INTO eventos_sincronizacion
          (operation_id, entidad, entidad_id, tipo, metodo, endpoint, payload,
           referencias_endpoint, origen, estado, creado_en)
         VALUES
          ($1, 'cliente', '900000000', 'crear', 'POST', '/clientes',
           jsonb_build_object('nombre', $4::text), NULL, 'remoto', 'sincronizado', $5::timestamp),
          ($2, 'vehiculo', '900000001', 'crear', 'POST', '/clientes/{clienteId}/vehiculos',
           '{"placa":"CURSOR-FAIL"}'::jsonb,
           jsonb_build_array(jsonb_build_object(
             'marcador', '{clienteId}',
             'entidad', 'cliente',
             'valorLocal', '900000002'
           )),
           'remoto', 'sincronizado', $5::timestamp),
          ($3, 'cliente', '900000003', 'crear', 'POST', '/clientes',
           jsonb_build_object('nombre', $6::text), NULL, 'remoto', 'sincronizado', $5::timestamp)`,
      [
        idsGrupo[0],
        idsGrupo[1],
        idsGrupo[2],
        `${prefix}-cursor-first`,
        fechaGrupo.fecha,
        `${prefix}-cursor-third`,
      ],
    );
    const primerPullFallido = ejecutarScript(
      "sincronizar-remoto.ts",
      scriptEnv(localUrl),
    );
    assert.notEqual(primerPullFallido.status, 0);
    const cursorTrasFallo = await localPool.query<{
      valor: string;
      operacion_id: string | null;
    }>(
      `SELECT to_char(valor, 'YYYY-MM-DD HH24:MI:SS.US') AS valor, operacion_id
           FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
    );
    assert.equal(cursorTrasFallo.rows[0]?.operacion_id, idsGrupo[0]);
    assert.equal(cursorTrasFallo.rows[0]?.valor, fechaGrupo.fecha);
    const acuseTrasFallo = await remotePool.query(
      `SELECT 1 FROM cursos_sincronizacion WHERE nombre = 'acuse_local'`,
    );
    assert.equal(acuseTrasFallo.rowCount, 0);
    await remotePool.query(
      `UPDATE eventos_sincronizacion
            SET endpoint = '/clientes', entidad = 'cliente',
                referencias_endpoint = NULL,
                payload = jsonb_build_object('nombre', $2::text)
          WHERE operation_id = $1`,
      [idsGrupo[1], `${prefix}-cursor-second`],
    );
    const segundoPull = ejecutarScript(
      "sincronizar-remoto.ts",
      scriptEnv(localUrl),
    );
    assert.equal(
      segundoPull.status,
      0,
      segundoPull.stderr || segundoPull.stdout,
    );
    const cursorTrasReintento = await localPool.query<{
      valor: string;
      operacion_id: string | null;
    }>(
      `SELECT to_char(valor, 'YYYY-MM-DD HH24:MI:SS.US') AS valor, operacion_id
           FROM cursos_sincronizacion WHERE nombre = 'remoto'`,
    );
    assert.equal(cursorTrasReintento.rows[0]?.operacion_id, idsGrupo[2]);
    const clientesGrupo = await localPool.query<{
      nombre: string;
      cantidad: string;
    }>(
      `SELECT nombre, count(*)::text AS cantidad FROM clientes
          WHERE nombre LIKE $1 GROUP BY nombre`,
      [`${prefix}-cursor-%`],
    );
    assert.equal(clientesGrupo.rowCount, 3);
    assert.ok(clientesGrupo.rows.every((cliente) => cliente.cantidad === "1"));

    const fecha = new Date().toISOString().slice(0, 10);
    const clienteLocal = await api<{ id: number }>(
      localBase(),
      "/clientes",
      "POST",
      { nombre: `${prefix}-cliente` },
      `${prefix}-cliente-create`,
    );
    assert.equal(
      ejecutarScript("sincronizar-local.ts", scriptEnv(localUrl)).status,
      0,
    );
    const [mapeoCliente] = await localPool
      .query<{ id_remoto: string }>(
        `SELECT id_remoto FROM referencias_sincronizacion
          WHERE entidad = 'cliente' AND id_local = $1`,
        [String(clienteLocal.id)],
      )
      .then((result) => result.rows);
    assert.ok(mapeoCliente);
    const vehiculoLocal = await api<{ id: number }>(
      localBase(),
      `/clientes/${clienteLocal.id}/vehiculos`,
      "POST",
      { placa: `${prefix}-PLACA` },
      `${prefix}-vehiculo-create`,
    );
    assert.equal(
      ejecutarScript("sincronizar-local.ts", scriptEnv(localUrl)).status,
      0,
    );
    const [mapeoVehiculo] = await localPool
      .query<{ id_remoto: string }>(
        `SELECT id_remoto FROM referencias_sincronizacion
          WHERE entidad = 'vehiculo' AND id_local = $1`,
        [String(vehiculoLocal.id)],
      )
      .then((result) => result.rows);
    assert.ok(mapeoVehiculo);

    const operationIdReintentoCredito = `${prefix}-retry-credit-create`;
    const payloadReintentoCredito = {
      tipo: "credito",
      concepto: `${prefix}-retry-credit`,
      fechaFactura: fecha,
      nombreCliente: "Prueba de reintento de crédito",
      valorCredito: 120,
      lineas: [
        {
          productoNombre: "Línea de reintento A",
          cantidad: 1,
          precioVenta: 50,
          precioCompra: 0,
        },
        {
          productoNombre: "Línea de reintento B",
          cantidad: 1,
          precioVenta: 70,
          precioCompra: 0,
        },
      ],
    };
    const creditoReintentoLocal = await api<CreditResponse>(
      localBase(),
      "/creditos",
      "POST",
      payloadReintentoCredito,
      operationIdReintentoCredito,
    );
    const eventoPendienteReintento = await localPool.query<{
      estado: string;
      entidad_id: string;
      referencias_respuesta: Array<{
        entidad: string;
        valorLocal: string;
      }>;
    }>(
      `SELECT estado, entidad_id, referencias_respuesta
           FROM eventos_sincronizacion WHERE operation_id = $1`,
      [operationIdReintentoCredito],
    );
    assert.equal(eventoPendienteReintento.rows[0]?.estado, "pendiente");
    assert.equal(
      eventoPendienteReintento.rows[0]?.referencias_respuesta.length,
      2,
    );

    const creditoYaCreadoEnRemoto = await api<CreditResponse>(
      remoteBase(),
      "/creditos",
      "POST",
      payloadReintentoCredito,
      operationIdReintentoCredito,
      true,
    );
    assert.equal(creditoYaCreadoEnRemoto.lineas.length, 2);
    const resultadoReintento = ejecutarScript(
      "sincronizar-local.ts",
      scriptEnv(localUrl),
    );
    const estadoDespuesDeReintento = await localPool.query<{
      estado: string;
      ultimo_error: string | null;
    }>(
      `SELECT estado, ultimo_error FROM eventos_sincronizacion
          WHERE operation_id = $1`,
      [operationIdReintentoCredito],
    );
    assert.equal(
      resultadoReintento.status,
      0,
      `${resultadoReintento.stdout}\n${resultadoReintento.stderr}\n` +
        `Evento: ${JSON.stringify(estadoDespuesDeReintento.rows[0])}`,
    );
    const eventoReintentado = await localPool.query<{ estado: string }>(
      `SELECT estado FROM eventos_sincronizacion WHERE operation_id = $1`,
      [operationIdReintentoCredito],
    );
    assert.equal(eventoReintentado.rows[0]?.estado, "sincronizado");
    const relacionesLineasReintentadas = await localPool.query<{
      id_local: string;
      id_remoto: string;
    }>(
      `SELECT id_local, id_remoto FROM referencias_sincronizacion
          WHERE entidad = 'credito_linea' AND id_local = ANY($1::text[])`,
      [creditoReintentoLocal.lineas.map((linea) => String(linea.id))],
    );
    assert.equal(relacionesLineasReintentadas.rowCount, 2);
    const relacionesPorLocal = new Map(
      relacionesLineasReintentadas.rows.map((relacion) => [
        relacion.id_local,
        relacion.id_remoto,
      ]),
    );
    for (
      let indice = 0;
      indice < creditoReintentoLocal.lineas.length;
      indice++
    ) {
      const lineaLocal = creditoReintentoLocal.lineas[indice];
      const lineaRemota = creditoYaCreadoEnRemoto.lineas[indice];
      assert.ok(lineaLocal);
      assert.ok(lineaRemota);
      assert.equal(
        relacionesPorLocal.get(String(lineaLocal.id)),
        String(lineaRemota.id),
      );
    }

    const localCreado = await api<CreditResponse>(
      localBase(),
      "/creditos",
      "POST",
      {
        tipo: "credito",
        concepto: `${prefix}-local`,
        fechaFactura: fecha,
        nombreCliente: "Prueba de sincronización local",
        valorCredito: 100,
        valorAbonado: 10,
        abonoInicialFecha: fecha,
        lineas: [
          {
            productoNombre: "Línea inicial local",
            cantidad: 1,
            precioVenta: 100,
            precioCompra: 0,
            valorAbonado: 10,
          },
        ],
      },
      `${prefix}-local-create`,
    );
    assert.ok(localCreado._syncNuevoAbonoId);
    assert.equal(
      ejecutarScript("sincronizar-local.ts", scriptEnv(localUrl)).status,
      0,
    );

    const [mapeoCredito] = await localPool
      .query<{ id_remoto: string }>(
        `SELECT id_remoto FROM referencias_sincronizacion
          WHERE entidad = 'credito' AND id_local = $1`,
        [String(localCreado.id)],
      )
      .then((result) => result.rows);
    assert.ok(mapeoCredito);
    const creditoRemotoId = Number(mapeoCredito.id_remoto);
    const filaCreditoRemotaInicial = await remotePool.query<{ id: number }>(
      `SELECT id FROM creditos
        WHERE id = $1 AND concepto = $2`,
      [creditoRemotoId, `${prefix}-local`],
    );
    assert.equal(filaCreditoRemotaInicial.rowCount, 1);
    const [mapeoAbonoInicialLocal] = await localPool
      .query<{ id_remoto: string }>(
        `SELECT id_remoto FROM referencias_sincronizacion
          WHERE entidad = 'abono_credito' AND id_local = $1`,
        [String(localCreado._syncNuevoAbonoId)],
      )
      .then((result) => result.rows);
    assert.ok(mapeoAbonoInicialLocal);
    const filaAbonoRemotaInicial = await remotePool.query<{
      id: number;
      credito_id: number;
    }>(
      `SELECT id, credito_id FROM abonos_creditos
        WHERE id = $1 AND credito_id = $2`,
      [Number(mapeoAbonoInicialLocal.id_remoto), creditoRemotoId],
    );
    assert.equal(filaAbonoRemotaInicial.rowCount, 1);

    const localEditado = await api<CreditResponse>(
      localBase(),
      `/creditos/${localCreado.id}`,
      "PUT",
      {
        valorCredito: 300,
        lineas: [
          { ...localCreado.lineas[0] },
          {
            productoNombre: "Línea agregada local",
            cantidad: 1,
            precioVenta: 200,
            precioCompra: 0,
          },
        ],
      },
      `${prefix}-local-edit`,
    );
    const lineaNuevaLocal = localEditado.lineas.find(
      (linea) => linea.productoNombre === "Línea agregada local",
    );
    assert.ok(lineaNuevaLocal);
    assert.equal(
      ejecutarScript("sincronizar-local.ts", scriptEnv(localUrl)).status,
      0,
    );

    const [mapeoLinea] = await localPool
      .query<{ id_remoto: string }>(
        `SELECT id_remoto FROM referencias_sincronizacion
          WHERE entidad = 'credito_linea' AND id_local = $1`,
        [String(lineaNuevaLocal.id)],
      )
      .then((result) => result.rows);
    assert.ok(mapeoLinea);
    const lineaRemotaId = Number(mapeoLinea.id_remoto);
    const creditoActualizadoRemoto = await api<CreditResponse & {
      valorCredito: number;
    }>(
      remoteBase(),
      `/creditos/${creditoRemotoId}`,
      "GET",
    );
    assert.equal(creditoActualizadoRemoto.id, creditoRemotoId);
    assert.equal(Number(creditoActualizadoRemoto.valorCredito), 300);

    await api<CreditResponse>(
      localBase(),
      `/creditos/${localCreado.id}/abono/${localCreado._syncNuevoAbonoId}`,
      "PUT",
      {
        valor: 15,
        lineas: [{ lineaId: localCreado.lineas[0]!.id, valor: 15 }],
        fechaAbono: fecha,
        fechaVentaDiaria: fecha,
      },
      `${prefix}-local-abono-inicial-edit`,
    );
    assert.equal(
      ejecutarScript("sincronizar-local.ts", scriptEnv(localUrl)).status,
      0,
    );
    const abonoInicialEditado = await remotePool.query<{
      linea_detalle: string;
      credito_id: number;
    }>(
      `SELECT linea_detalle, credito_id FROM abonos_creditos
        WHERE id = $1`,
      [Number(mapeoAbonoInicialLocal.id_remoto)],
    );
    assert.equal(abonoInicialEditado.rows[0]?.credito_id, creditoRemotoId);
    assert.equal(
      JSON.parse(abonoInicialEditado.rows[0]?.linea_detalle ?? "{}")
        .lineas?.[0]?.valor,
      15,
    );

    await api<CreditResponse>(
      localBase(),
      `/creditos/${localCreado.id}/abono`,
      "POST",
      {
        valor: 20,
        lineas: [{ lineaId: lineaNuevaLocal.id, valor: 20 }],
        fechaAbono: fecha,
        fechaVentaDiaria: fecha,
      },
      `${prefix}-local-abono`,
    );
    assert.equal(
      ejecutarScript("sincronizar-local.ts", scriptEnv(localUrl)).status,
      0,
    );
    const abonoRemoto = await remotePool.query<{ linea_detalle: string }>(
      `SELECT linea_detalle FROM abonos_creditos
          WHERE credito_id = $1 ORDER BY id DESC LIMIT 1`,
      [creditoRemotoId],
    );
    const detalleRemoto = JSON.parse(
      abonoRemoto.rows[0]?.linea_detalle ?? "{}",
    ) as {
      lineas?: Array<{ lineaId: number }>;
    };
    assert.equal(detalleRemoto.lineas?.[0]?.lineaId, lineaRemotaId);

    const remotoCreado = await api<CreditResponse>(
      remoteBase(),
      "/creditos",
      "POST",
      {
        tipo: "credito",
        concepto: `${prefix}-remote`,
        fechaFactura: fecha,
        nombreCliente: "Prueba de sincronización remota",
        valorCredito: 100,
        valorAbonado: 10,
        abonoInicialFecha: fecha,
        lineas: [
          {
            productoNombre: "Línea inicial remota",
            cantidad: 1,
            precioVenta: 100,
            precioCompra: 0,
            valorAbonado: 10,
          },
        ],
      },
      `${prefix}-remote-create`,
    );
    assert.ok(remotoCreado._syncNuevoAbonoId);
    const operationIdReintentoRemoto = `${prefix}-remote-retry-credit-create`;
    const payloadReintentoRemoto = {
      tipo: "credito",
      concepto: `${prefix}-remote-retry`,
      fechaFactura: fecha,
      nombreCliente: "Prueba de reintento remoto",
      valorCredito: 120,
      lineas: [
        {
          productoNombre: "Línea remota reintento A",
          cantidad: 1,
          precioVenta: 50,
          precioCompra: 0,
        },
        {
          productoNombre: "Línea remota reintento B",
          cantidad: 1,
          precioVenta: 70,
          precioCompra: 0,
        },
      ],
    };
    const creditoReintentoRemoto = await api<CreditResponse>(
      remoteBase(),
      "/creditos",
      "POST",
      payloadReintentoRemoto,
      operationIdReintentoRemoto,
    );
    const creditoYaAplicadoLocal = await api<CreditResponse>(
      localBase(),
      "/creditos",
      "POST",
      payloadReintentoRemoto,
      operationIdReintentoRemoto,
      true,
    );
    const remotoEditado = await api<CreditResponse>(
      remoteBase(),
      `/creditos/${remotoCreado.id}`,
      "PUT",
      {
        valorCredito: 300,
        lineas: [
          { ...remotoCreado.lineas[0] },
          {
            productoNombre: "Línea agregada remota",
            cantidad: 1,
            precioVenta: 200,
            precioCompra: 0,
          },
        ],
      },
      `${prefix}-remote-edit`,
    );
    const lineaNuevaRemota = remotoEditado.lineas.find(
      (linea) => linea.productoNombre === "Línea agregada remota",
    );
    assert.ok(lineaNuevaRemota);
    const remoteAbono = await api<CreditResponse>(
      remoteBase(),
      `/creditos/${remotoCreado.id}/abono`,
      "POST",
      {
        valor: 20,
        lineas: [{ lineaId: lineaNuevaRemota.id, valor: 20 }],
        fechaAbono: fecha,
        fechaVentaDiaria: fecha,
      },
      `${prefix}-remote-abono`,
    );
    assert.ok(remoteAbono._syncNuevoAbonoId);
    await api<CreditResponse>(
      remoteBase(),
      `/creditos/${remotoCreado.id}/abono/${remoteAbono._syncNuevoAbonoId}`,
      "PUT",
      {
        valor: 10,
        lineas: [{ lineaId: lineaNuevaRemota.id, valor: 10 }],
        fechaAbono: fecha,
        fechaVentaDiaria: fecha,
      },
      `${prefix}-remote-abono-edit`,
    );
    await api(
      remoteBase(),
      `/clientes/${Number(mapeoCliente.id_remoto)}/vehiculos/${Number(mapeoVehiculo.id_remoto)}`,
      "PUT",
      { placa: `${prefix}-PLACA-EDITADA` },
      `${prefix}-remote-vehiculo-edit`,
    );
    const clienteEditadoRemoto = await api<{ id: number }>(
      remoteBase(),
      `/clientes/${Number(mapeoCliente.id_remoto)}`,
      "PUT",
      { nombre: `${prefix}-cliente-remoto` },
      `${prefix}-remote-cliente-edit`,
    );
    assert.ok(clienteEditadoRemoto.id);
    await api(
      localBase(),
      `/clientes/${clienteLocal.id}`,
      "PUT",
      { nombre: `${prefix}-cliente-local` },
      `${prefix}-local-cliente-conflicto`,
    );
    const subidaConConflicto = ejecutarScript(
      "sincronizar-local.ts",
      scriptEnv(localUrl),
    );
    assert.equal(
      subidaConConflicto.status,
      3,
      subidaConConflicto.stderr || subidaConConflicto.stdout,
    );
    const eventoLocalEnConflicto = await localPool.query<{
      estado: string;
      ultimo_error: string;
    }>(
      `SELECT estado, ultimo_error FROM eventos_sincronizacion
          WHERE operation_id = $1`,
      [`${prefix}-local-cliente-conflicto`],
    );
    assert.equal(eventoLocalEnConflicto.rows[0]?.estado, "conflicto");
    assert.match(
      eventoLocalEnConflicto.rows[0]?.ultimo_error ?? "",
      new RegExp(`${prefix}-remote-cliente-edit`),
    );

    await esperar(async () => {
      const result = await remotePool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM eventos_sincronizacion
            WHERE origen = 'remoto' AND operation_id LIKE $1`,
        [`${prefix}-remote-%`],
      );
      return Number(result.rows[0]?.count) === 7;
    }, "No se capturaron todos los eventos remotos de prueba.");
    await delay(2_100);

    const resultadoPull = ejecutarScript(
      "sincronizar-remoto.ts",
      scriptEnv(localUrl),
    );
    assert.equal(
      resultadoPull.status,
      0,
      resultadoPull.stderr || resultadoPull.stdout,
    );
    const clienteLocalTrasConflicto = await localPool.query<{
      nombre: string;
    }>("SELECT nombre FROM clientes WHERE id = $1", [clienteLocal.id]);
    assert.equal(
      clienteLocalTrasConflicto.rows[0]?.nombre,
      `${prefix}-cliente-remoto`,
    );
    const [mapeoCreditoDescargado] = await localPool
      .query<{ id_local: string }>(
        `SELECT id_local FROM referencias_sincronizacion
          WHERE entidad = 'credito' AND id_remoto = $1`,
        [String(remotoCreado.id)],
      )
      .then((result) => result.rows);
    assert.ok(mapeoCreditoDescargado);
    const creditoLocalRemoto = await localPool.query<{ id: number }>(
      `SELECT id FROM creditos
        WHERE id = $1 AND concepto = $2`,
      [Number(mapeoCreditoDescargado.id_local), `${prefix}-remote`],
    );
    assert.equal(creditoLocalRemoto.rowCount, 1);
    const [mapeoAbonoInicialDescargado] = await localPool
      .query<{ id_local: string }>(
        `SELECT id_local FROM referencias_sincronizacion
          WHERE entidad = 'abono_credito' AND id_remoto = $1`,
        [String(remotoCreado._syncNuevoAbonoId)],
      )
      .then((result) => result.rows);
    assert.ok(mapeoAbonoInicialDescargado);
    const abonoInicialLocalDescargado = await localPool.query<{
      id: number;
      credito_id: number;
    }>(
      `SELECT id, credito_id FROM abonos_creditos
        WHERE id = $1 AND credito_id = $2`,
      [
        Number(mapeoAbonoInicialDescargado.id_local),
        Number(mapeoCreditoDescargado.id_local),
      ],
    );
    assert.equal(abonoInicialLocalDescargado.rowCount, 1);
    const creditoEditadoDesdeRender = await api<CreditResponse & {
      valorCredito: number;
    }>(
      localBase(),
      `/creditos/${mapeoCreditoDescargado.id_local}`,
      "GET",
    );
    assert.equal(
      Number(creditoEditadoDesdeRender.valorCredito),
      300,
    );
    const relacionesLineasReintentoRemoto = await localPool.query<{
      id_local: string;
      id_remoto: string;
    }>(
      `SELECT id_local, id_remoto FROM referencias_sincronizacion
          WHERE entidad = 'credito_linea' AND id_local = ANY($1::text[])`,
      [creditoYaAplicadoLocal.lineas.map((linea) => String(linea.id))],
    );
    assert.equal(relacionesLineasReintentoRemoto.rowCount, 2);
    const relacionesPorLineaLocal = new Map(
      relacionesLineasReintentoRemoto.rows.map((relacion) => [
        relacion.id_local,
        relacion.id_remoto,
      ]),
    );
    for (
      let indice = 0;
      indice < creditoYaAplicadoLocal.lineas.length;
      indice++
    ) {
      const lineaLocal = creditoYaAplicadoLocal.lineas[indice];
      const lineaRemota = creditoReintentoRemoto.lineas[indice];
      assert.ok(lineaLocal);
      assert.ok(lineaRemota);
      assert.equal(
        relacionesPorLineaLocal.get(String(lineaLocal.id)),
        String(lineaRemota.id),
      );
    }
    const [vehiculoActualizadoLocal] = await localPool
      .query<{
        placa: string;
      }>("SELECT placa FROM vehiculos_cliente WHERE id = $1", [
        vehiculoLocal.id,
      ])
      .then((result) => result.rows);
    assert.equal(vehiculoActualizadoLocal?.placa, `${prefix}-PLACA-EDITADA`);
    const [mapeoLineaRemota] = await localPool
      .query<{ id_local: string }>(
        `SELECT id_local FROM referencias_sincronizacion
          WHERE entidad = 'credito_linea' AND id_remoto = $1`,
        [String(lineaNuevaRemota.id)],
      )
      .then((result) => result.rows);
    assert.ok(mapeoLineaRemota);

    const [eventoAbonoRemoto] = await remotePool
      .query<{
        entidad_id: string;
      }>(
        `SELECT entidad_id FROM eventos_sincronizacion WHERE operation_id = $1`,
        [`${prefix}-remote-abono`],
      )
      .then((result) => result.rows);
    assert.ok(eventoAbonoRemoto);
    const mapeoAbono = await localPool.query<{
      id_local: string;
      id_remoto: string;
    }>(
      `SELECT id_local, id_remoto FROM referencias_sincronizacion
          WHERE entidad = 'abono_credito' AND id_remoto = $1`,
      [eventoAbonoRemoto.entidad_id],
    );
    assert.equal(mapeoAbono.rowCount, 1);
    const abonoLocal = await localPool.query<{ linea_detalle: string }>(
      `SELECT linea_detalle FROM abonos_creditos WHERE id = $1`,
      [Number(mapeoAbono.rows[0]?.id_local)],
    );
    const detalleLocal = JSON.parse(
      abonoLocal.rows[0]?.linea_detalle ?? "{}",
    ) as {
      lineas?: Array<{ lineaId: number; valor: number }>;
    };
    assert.equal(
      detalleLocal.lineas?.[0]?.lineaId,
      Number(mapeoLineaRemota.id_local),
    );
    assert.equal(detalleLocal.lineas?.[0]?.valor, 10);

    const acuse = await remotePool.query<{ valor: string }>(
      `SELECT to_char(valor, 'YYYY-MM-DD HH24:MI:SS.US') AS valor
           FROM cursos_sincronizacion WHERE nombre = 'acuse_local'`,
    );
    assert.equal(acuse.rowCount, 1);
    const acuseRepetido = await api<{ ok: boolean }>(
      remoteBase(),
      "/sync/ack",
      "POST",
      { hasta: acuse.rows[0]?.valor },
      undefined,
      true,
    );
    assert.equal(acuseRepetido.ok, true);
    const acuseAntiguo = await api<{ ok: boolean }>(
      remoteBase(),
      "/sync/ack",
      "POST",
      { hasta: "1970-01-01 00:00:00.000000" },
      undefined,
      true,
    );
    assert.equal(acuseAntiguo.ok, true);
    const cursorDespuesDeAcuseAntiguo = await remotePool.query<{
      valor: string;
    }>(
      `SELECT to_char(valor, 'YYYY-MM-DD HH24:MI:SS.US') AS valor
           FROM cursos_sincronizacion WHERE nombre = 'acuse_local'`,
    );
    assert.equal(
      cursorDespuesDeAcuseAntiguo.rows[0]?.valor,
      acuse.rows[0]?.valor,
    );
    const eventosDeAcuse = await remotePool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM eventos_sincronizacion
          WHERE origen = 'remoto' AND endpoint LIKE '%/sync/ack%'`,
    );
    assert.equal(Number(eventosDeAcuse.rows[0]?.count), 0);
    const coberturaAcuse = await remotePool.query<{ noAvanzaMasAlla: boolean }>(
      `SELECT (
           SELECT valor FROM cursos_sincronizacion WHERE nombre = 'acuse_local'
         ) <= (
           SELECT max(creado_en) FROM eventos_sincronizacion
            WHERE origen = 'remoto' AND operation_id LIKE $1
         ) AS "noAvanzaMasAlla"`,
      [`${prefix}-remote-%`],
    );
    assert.equal(coberturaAcuse.rows[0]?.noAvanzaMasAlla, true);

    const creditosConAbonosNuevos = await api<CreditResponse>(
      localBase(),
      "/creditos",
      "POST",
      {
        tipo: "credito",
        concepto: `${prefix}-credit-ventas-generadas`,
        fechaFactura: fecha,
        nombreCliente: `${prefix}-cliente-credit-ventas`,
        valorCredito: 300,
        valorAbonado: 300,
        abonoInicialFecha: fecha,
        lineas: [
          {
            productoNombre: `${prefix}-servicio-abono-a`,
            cantidad: 1,
            precioVenta: 100,
            precioCompra: 0,
            valorAbonado: 100,
          },
          {
            productoNombre: `${prefix}-servicio-abono-b`,
            cantidad: 1,
            precioVenta: 200,
            precioCompra: 0,
            valorAbonado: 200,
          },
        ],
      },
      `${prefix}-local-credit-ventas-generadas`,
    );
    assert.equal(creditosConAbonosNuevos._syncVentasGeneradas?.length, 2);

    const manoObraGenerada = await api<{
      id: number;
      _syncManoObraId: number;
    }>(
      localBase(),
      "/ventas/manoobra",
      "POST",
      {
        fecha,
        referencia: `${prefix}-manoobra-generada`,
        valorTotal: 70000,
        distribuciones: [],
      },
      `${prefix}-local-manoobra-generada`,
    );
    assert.ok(manoObraGenerada._syncManoObraId);

    const clienteVehiculoLocal = await api<{
      id: number;
      vehiculos: Array<{ id: number }>;
    }>(
      localBase(),
      "/clientes",
      "POST",
      {
        nombre: `${prefix}-cliente-con-vehiculo-local`,
        vehiculos: [{ placa: `${prefix}-PLACA-LOCAL` }],
      },
      `${prefix}-local-cliente-con-vehiculo`,
    );
    assert.equal(clienteVehiculoLocal.vehiculos.length, 1);

    const loteVentasLocal = await api<Array<{ id: number }>>(
      localBase(),
      "/ventas/lote-pago-antiguo",
      "POST",
      {
        items: ["A", "B"].map((sufijo) => ({
          fecha,
          referencia: `${prefix}-lote-venta-${sufijo}`,
          productoNombre: `${prefix}-lote-servicio-${sufijo}`,
          tipoLinea: "manoobra",
          cantidad: 1,
          precioCompraUnidad: 0,
          precioVentaUnidad: 30000,
          precioVentaTotal: 30000,
          beneficio: 30000,
        })),
      },
      `${prefix}-local-lote-ventas`,
    );
    assert.equal(loteVentasLocal.length, 2);

    const subidaFilasSecundarias = ejecutarScript(
      "sincronizar-local.ts",
      scriptEnv(localUrl),
    );
    assert.equal(
      subidaFilasSecundarias.status,
      3,
      subidaFilasSecundarias.stderr || subidaFilasSecundarias.stdout,
    );
    const operacionesFilasSecundarias = [
      `${prefix}-local-credit-ventas-generadas`,
      `${prefix}-local-manoobra-generada`,
      `${prefix}-local-cliente-con-vehiculo`,
      `${prefix}-local-lote-ventas`,
    ];
    const estadosFilasSecundarias = await localPool.query<{
      operation_id: string;
      estado: string;
      ultimo_error: string | null;
    }>(
      `SELECT operation_id, estado, ultimo_error FROM eventos_sincronizacion
        WHERE operation_id = ANY($1::text[])
        ORDER BY operation_id`,
      [operacionesFilasSecundarias],
    );
    assert.equal(estadosFilasSecundarias.rowCount, 4);
    assert.ok(
      estadosFilasSecundarias.rows.every(
        ({ estado }) => estado === "sincronizado",
      ),
      JSON.stringify(estadosFilasSecundarias.rows),
    );
    const conflictoAnterior = await localPool.query(
      `SELECT 1 FROM eventos_sincronizacion
        WHERE operation_id = $1 AND estado = 'conflicto'`,
      [`${prefix}-local-cliente-conflicto`],
    );
    assert.equal(conflictoAnterior.rowCount, 1);

    const mapeosVentasAbono = await localPool.query<{
      id_local: string;
      id_remoto: string;
    }>(
      `SELECT id_local, id_remoto FROM referencias_sincronizacion
        WHERE entidad = 'venta'
          AND id_local = ANY($1::text[])
        ORDER BY id_local`,
      [creditosConAbonosNuevos._syncVentasGeneradas!.map(({ id }) => String(id))],
    );
    assert.equal(mapeosVentasAbono.rowCount, 2);
    const mapeoManoObra = await localPool.query<{
      id_local: string;
      id_remoto: string;
    }>(
      `SELECT id_local, id_remoto FROM referencias_sincronizacion
        WHERE entidad = 'mano_obra' AND id_local = $1`,
      [String(manoObraGenerada._syncManoObraId)],
    );
    assert.equal(mapeoManoObra.rowCount, 1);
    const mapeoClienteConVehiculo = await localPool.query<{
      id_local: string;
      id_remoto: string;
    }>(
      `SELECT id_local, id_remoto FROM referencias_sincronizacion
        WHERE entidad = 'vehiculo' AND id_local = $1`,
      [String(clienteVehiculoLocal.vehiculos[0]!.id)],
    );
    assert.equal(mapeoClienteConVehiculo.rowCount, 1);
    const mapeoClientePadre = await localPool.query<{
      id_local: string;
      id_remoto: string;
    }>(
      `SELECT id_local, id_remoto FROM referencias_sincronizacion
        WHERE entidad = 'cliente' AND id_local = $1`,
      [String(clienteVehiculoLocal.id)],
    );
    assert.equal(mapeoClientePadre.rowCount, 1);
    const mapeosLoteVentas = await localPool.query<{
      id_local: string;
      id_remoto: string;
    }>(
      `SELECT id_local, id_remoto FROM referencias_sincronizacion
        WHERE entidad = 'venta' AND id_local = ANY($1::text[])
        ORDER BY id_local`,
      [loteVentasLocal.map(({ id }) => String(id))],
    );
    assert.equal(mapeosLoteVentas.rowCount, 2);
    assert.notEqual(
      mapeosLoteVentas.rows[0]?.id_remoto,
      mapeosLoteVentas.rows[1]?.id_remoto,
    );

    const ventaAbonoRemotaId = mapeosVentasAbono.rows[0]!.id_remoto;
    await api(
      remoteBase(),
      `/ventas/${ventaAbonoRemotaId}`,
      "DELETE",
      undefined,
      `${prefix}-remote-borrar-venta-abono`,
    );
    const manoObraRemotaId = mapeoManoObra.rows[0]!.id_remoto;
    await api(
      remoteBase(),
      `/manoobra/${manoObraRemotaId}`,
      "PUT",
      {
        fecha,
        descripcion: `${prefix}-manoobra-editada-en-render`,
        valorTotal: 71000,
        distribuciones: [],
      },
      `${prefix}-remote-editar-manoobra`,
    );
    const clienteRemotoId = mapeoClientePadre.rows[0]!.id_remoto;
    const vehiculoRemotoId = mapeoClienteConVehiculo.rows[0]!.id_remoto;
    await api(
      remoteBase(),
      `/clientes/${clienteRemotoId}/vehiculos/${vehiculoRemotoId}`,
      "PUT",
      { placa: `${prefix}-PLACA-EDITADA-EN-RENDER` },
      `${prefix}-remote-editar-vehiculo-local`,
    );
    for (const mapeo of mapeosLoteVentas.rows) {
      await api(
        remoteBase(),
        `/ventas/${mapeo.id_remoto}`,
        "DELETE",
        undefined,
        `${prefix}-remote-borrar-venta-lote-${mapeo.id_local}`,
      );
    }

    const clienteVehiculoRemoto = await api<{
      id: number;
      vehiculos: Array<{ id: number }>;
    }>(
      remoteBase(),
      "/clientes",
      "POST",
      {
        nombre: `${prefix}-cliente-con-vehiculo-render`,
        vehiculos: [{ placa: `${prefix}-PLACA-RENDER` }],
      },
      `${prefix}-remote-cliente-con-vehiculo`,
    );
    assert.equal(clienteVehiculoRemoto.vehiculos.length, 1);

    await delay(2_100);
    const descargaFilasSecundarias = ejecutarScript(
      "sincronizar-remoto.ts",
      scriptEnv(localUrl),
    );
    assert.equal(
      descargaFilasSecundarias.status,
      0,
      descargaFilasSecundarias.stderr || descargaFilasSecundarias.stdout,
    );

    const ventasAbonoLocales = await localPool.query(
      `SELECT id FROM ventas_diarias
        WHERE id = ANY($1::int[])`,
      [creditosConAbonosNuevos._syncVentasGeneradas!.map(({ id }) => id)],
    );
    assert.equal(ventasAbonoLocales.rowCount, 1);
    assert.equal(
      ventasAbonoLocales.rows[0]?.id,
      Number(mapeosVentasAbono.rows[1]!.id_local),
    );
    const manoObraLocalActualizada = await localPool.query<{
      descripcion: string;
    }>(
      "SELECT descripcion FROM mano_obra WHERE id = $1",
      [manoObraGenerada._syncManoObraId],
    );
    assert.equal(
      manoObraLocalActualizada.rows[0]?.descripcion,
      `${prefix}-manoobra-editada-en-render`,
    );
    const vehiculoLocalActualizado = await localPool.query<{ placa: string }>(
      "SELECT placa FROM vehiculos_cliente WHERE id = $1",
      [clienteVehiculoLocal.vehiculos[0]!.id],
    );
    assert.equal(
      vehiculoLocalActualizado.rows[0]?.placa,
      `${prefix}-PLACA-EDITADA-EN-RENDER`,
    );
    const ventasLoteLocales = await localPool.query<{ id: number }>(
      `SELECT id FROM ventas_diarias WHERE id = ANY($1::int[])`,
      [loteVentasLocal.map(({ id }) => id)],
    );
    assert.equal(ventasLoteLocales.rowCount, 0);

    const mapeoClienteCreadoRemoto = await localPool.query<{
      id_local: string;
      id_remoto: string;
    }>(
      `SELECT id_local, id_remoto FROM referencias_sincronizacion
        WHERE entidad = 'cliente' AND id_remoto = $1`,
      [String(clienteVehiculoRemoto.id)],
    );
    const mapeoVehiculoCreadoRemoto = await localPool.query<{
      id_local: string;
      id_remoto: string;
    }>(
      `SELECT id_local, id_remoto FROM referencias_sincronizacion
        WHERE entidad = 'vehiculo' AND id_remoto = $1`,
      [String(clienteVehiculoRemoto.vehiculos[0]!.id)],
    );
    assert.equal(mapeoClienteCreadoRemoto.rowCount, 1);
    assert.equal(mapeoVehiculoCreadoRemoto.rowCount, 1);
    await api(
      localBase(),
      `/clientes/${mapeoClienteCreadoRemoto.rows[0]!.id_local}/vehiculos/${mapeoVehiculoCreadoRemoto.rows[0]!.id_local}`,
      "PUT",
      { placa: `${prefix}-PLACA-EDITADA-EN-PC` },
      `${prefix}-local-editar-vehiculo-remoto`,
    );
    const subidaVehiculoCreadoRemoto = ejecutarScript(
      "sincronizar-local.ts",
      scriptEnv(localUrl),
    );
    const estadoSubidaVehiculo = await localPool.query<{
      estado: string;
      ultimo_error: string | null;
    }>(
      `SELECT estado, ultimo_error FROM eventos_sincronizacion
        WHERE operation_id = $1`,
      [`${prefix}-local-editar-vehiculo-remoto`],
    );
    assert.equal(
      subidaVehiculoCreadoRemoto.status,
      3,
      [
        subidaVehiculoCreadoRemoto.stderr ||
          subidaVehiculoCreadoRemoto.stdout,
        JSON.stringify(estadoSubidaVehiculo.rows),
      ]
        .filter(Boolean)
        .join("\n"),
    );
    const vehiculoRemotoActualizado = await remotePool.query<{ placa: string }>(
      "SELECT placa FROM vehiculos_cliente WHERE id = $1",
      [Number(clienteVehiculoRemoto.vehiculos[0]!.id)],
    );
    assert.equal(
      vehiculoRemotoActualizado.rows[0]?.placa,
      `${prefix}-PLACA-EDITADA-EN-PC`,
    );

    const eventoAntiguo = `${prefix}-retencion`;
    const eventoErrorAntiguo = `${prefix}-error`;
    const eventoConflictoAntiguo = `${prefix}-conflicto`;
    await remotePool.query(
      `INSERT INTO eventos_sincronizacion
          (operation_id, entidad, entidad_id, tipo, metodo, endpoint, payload,
           origen, estado, creado_en, procesado_en)
         VALUES ($1, 'e2e', '1', 'crear', 'POST', '/e2e', '{}'::jsonb,
           'remoto', 'sincronizado', now() - interval '61 days', now() - interval '61 days'),
                ($2, 'e2e', '2', 'crear', 'POST', '/e2e', '{}'::jsonb,
           'remoto', 'error', now() - interval '61 days', now() - interval '61 days'),
                ($3, 'e2e', '3', 'crear', 'POST', '/e2e', '{}'::jsonb,
           'remoto', 'conflicto', now() - interval '61 days', now() - interval '61 days')`,
      [eventoAntiguo, eventoErrorAntiguo, eventoConflictoAntiguo],
    );
    await remotePool.query(
      "DELETE FROM cursos_sincronizacion WHERE nombre = 'acuse_local'",
    );
    const cleanEnv = childEnv({ DATABASE_URL: remoteUrl });
    const limpiaSinAcuse = spawnSync(
      process.execPath,
      ["--import", "tsx", join("src", "limpiar-operaciones-viejas.ts")],
      { cwd: scriptsRoot, env: cleanEnv, encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(limpiaSinAcuse.status, 0, limpiaSinAcuse.stderr);
    const conservado = await remotePool.query(
      `SELECT 1 FROM eventos_sincronizacion WHERE operation_id = $1`,
      [eventoAntiguo],
    );
    assert.equal(conservado.rowCount, 1);

    await remotePool.query(
      `INSERT INTO cursos_sincronizacion (nombre, valor)
         VALUES ('acuse_local', $1)
         ON CONFLICT (nombre) DO UPDATE SET valor = EXCLUDED.valor`,
      [acuse.rows[0]!.valor],
    );
    const limpiaConAcuse = spawnSync(
      process.execPath,
      ["--import", "tsx", join("src", "limpiar-operaciones-viejas.ts")],
      { cwd: scriptsRoot, env: cleanEnv, encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(limpiaConAcuse.status, 0, limpiaConAcuse.stderr);
    const eliminado = await remotePool.query(
      `SELECT 1 FROM eventos_sincronizacion WHERE operation_id = $1`,
      [eventoAntiguo],
    );
    assert.equal(eliminado.rowCount, 0);
    const noSincronizadosAntiguos = await remotePool.query(
      `SELECT operation_id FROM eventos_sincronizacion
          WHERE operation_id = ANY($1::text[])`,
      [[eventoErrorAntiguo, eventoConflictoAntiguo]],
    );
    assert.equal(noSincronizadosAntiguos.rowCount, 2);

    const localFallido = await api<CreditResponse>(
      localBase(),
      "/creditos",
      "POST",
      {
        tipo: "credito",
        concepto: `${prefix}-atomic`,
        fechaFactura: fecha,
        nombreCliente: "Prueba de atomicidad",
        valorCredito: 100,
        lineas: [
          {
            productoNombre: "Línea de atomicidad",
            cantidad: 1,
            precioVenta: 100,
            precioCompra: 0,
          },
        ],
      },
      `${prefix}-atomic-create`,
    );
    await localPool.query(
      `UPDATE eventos_sincronizacion
            SET referencias_respuesta = $2::jsonb
          WHERE operation_id = $1`,
      [
        `${prefix}-atomic-create`,
        JSON.stringify([
          {
            campo: "lineas.0.id",
            entidad: "credito_linea",
            valorLocal: String(localFallido.lineas[0]!.id),
          },
          {
            campo: "lineas.99.id",
            entidad: "credito_linea",
            valorLocal: `${localFallido.lineas[0]!.id}-missing`,
          },
        ]),
      ],
    );
    const resultadoAtomico = ejecutarScript(
      "sincronizar-local.ts",
      scriptEnv(localUrl),
    );
    assert.notEqual(resultadoAtomico.status, 0);
    const relacionesAtomicas = await localPool.query(
      `SELECT 1 FROM referencias_sincronizacion
          WHERE (entidad = 'credito' AND id_local = $1)
             OR (entidad = 'credito_linea' AND id_local = $2)`,
      [String(localFallido.id), String(localFallido.lineas[0]!.id)],
    );
    assert.equal(relacionesAtomicas.rowCount, 0);
    const estadoFallido = await localPool.query<{ estado: string }>(
      `SELECT estado FROM eventos_sincronizacion WHERE operation_id = $1`,
      [`${prefix}-atomic-create`],
    );
    assert.equal(estadoFallido.rows[0]?.estado, "error");
    for (const pool of [localPool, remotePool]) {
      const duplicadosRemotos = await pool.query(
        `SELECT entidad, id_remoto FROM referencias_sincronizacion
          GROUP BY entidad, id_remoto HAVING count(*) > 1`,
      );
      const duplicadosLocales = await pool.query(
        `SELECT entidad, id_local FROM referencias_sincronizacion
          GROUP BY entidad, id_local HAVING count(*) > 1`,
      );
      assert.equal(duplicadosRemotos.rowCount, 0);
      assert.equal(duplicadosLocales.rowCount, 0);
    }
  } catch (error) {
    errorPrueba = error;
    huboErrorPrueba = true;
  } finally {
    try {
      if (localApi && remoteApi) {
        for (const [pool, base] of [
          [localPool, localBase()],
          [remotePool, remoteBase()],
        ] as const) {
          const creditos = await pool.query<{ id: number }>(
            "SELECT id FROM creditos WHERE concepto LIKE $1",
            [`${prefix}%`],
          );
          for (const credito of creditos.rows) {
            await api(
              base,
              `/creditos/${credito.id}`,
              "DELETE",
              undefined,
              `${prefix}-cleanup-${credito.id}`,
              true,
            );
          }
          const clientes = await pool.query<{ id: number }>(
            "SELECT id FROM clientes WHERE nombre LIKE $1",
            [`${prefix}%`],
          );
          for (const cliente of clientes.rows) {
            await api(
              base,
              `/clientes/${cliente.id}`,
              "DELETE",
              undefined,
              `${prefix}-cleanup-client-${cliente.id}`,
              true,
            );
          }
        }
      }
      await Promise.all(
        [localPool, remotePool].map((pool) =>
          (async () => {
            await pool.query("DELETE FROM eventos_sincronizacion");
            await pool.query("DELETE FROM operaciones_sincronizadas");
            await pool.query("DELETE FROM referencias_sincronizacion");
            await pool.query("DELETE FROM cursos_sincronizacion");
          })(),
        ),
      );
      await Promise.all(
        [localPool, remotePool].map(async (pool) => {
          await pool.query(
            "UPDATE mano_obra SET venta_id = NULL WHERE descripcion LIKE $1",
            [`${prefix}%`],
          );
          await pool.query(
            "UPDATE ventas_diarias SET mano_obra_id = NULL WHERE referencia LIKE $1",
            [`${prefix}%`],
          );
          await pool.query(
            `DELETE FROM distribuciones_mano_obra
              WHERE mano_obra_id IN (
                SELECT id FROM mano_obra WHERE descripcion LIKE $1
              )`,
            [`${prefix}%`],
          );
          await pool.query("DELETE FROM mano_obra WHERE descripcion LIKE $1", [
            `${prefix}%`,
          ]);
          await pool.query(
            "DELETE FROM ventas_diarias WHERE referencia LIKE $1",
            [`${prefix}%`],
          );
          await pool.query("DELETE FROM productos WHERE nombre LIKE $1", [
            `${prefix}%`,
          ]);
        }),
      );
    } catch (error) {
      erroresLimpieza.push(error);
    }

    detenerApi(localApi);
    detenerApi(remoteApi);
    try {
      await Promise.all([localPool.end(), remotePool.end()]);
    } catch (error) {
      erroresLimpieza.push(error);
    }
  }

  if (huboErrorPrueba) {
    if (erroresLimpieza.length > 0) {
      throw new AggregateError(
        [errorPrueba, ...erroresLimpieza],
        "La E2E falló y también hubo errores durante la limpieza; el primer error corresponde al escenario de prueba.",
        { cause: errorPrueba },
      );
    }
    throw errorPrueba;
  }
  if (erroresLimpieza.length > 0) {
    throw new AggregateError(
      erroresLimpieza,
      "La limpieza de la E2E no se completó correctamente.",
    );
  }
});
