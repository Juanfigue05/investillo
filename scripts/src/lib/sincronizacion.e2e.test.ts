import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import test from "node:test";

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
};

function assertTestDatabase(databaseUrl: string, expectedName: string): void {
  const parsed = new URL(databaseUrl);
  const nombreAislado =
    expectedName === "investillo_sync_local"
      ? "investillo_order8_sync_local"
      : "investillo_order8_sync_remote";
  if (
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname) ||
    ![`/${expectedName}`, `/${nombreAislado}`].includes(parsed.pathname)
  ) {
    throw new Error(
      `E2E bloqueado: se requiere una base loopback de pruebas para ${expectedName}`,
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

  try {
    await Promise.all(
      [localPool, remotePool].map((pool) =>
        pool.query(
          `ALTER TABLE cursos_sincronizacion
               ADD COLUMN IF NOT EXISTS operacion_id text;
             DELETE FROM eventos_sincronizacion;
             DELETE FROM operaciones_sincronizadas;
             DELETE FROM referencias_sincronizacion;
             DELETE FROM cursos_sincronizacion;`,
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
      `INSERT INTO eventos_sincronizacion
          (operation_id, entidad, entidad_id, tipo, metodo, endpoint, payload,
           referencias_endpoint, origen, estado, creado_en)
         VALUES
          ($1, 'cliente', '1', 'crear', 'POST', '/clientes',
           jsonb_build_object('nombre', $4::text), NULL, 'remoto', 'sincronizado', $5::timestamp),
          ($2, 'vehiculo', '2', 'crear', 'POST', '/clientes/{clienteId}/vehiculos',
           '{"placa":"CURSOR-FAIL"}'::jsonb,
           jsonb_build_array(jsonb_build_object(
             'marcador', '{clienteId}',
             'entidad', 'cliente',
             'valorLocal', $6::text
           )),
           'remoto', 'sincronizado', $5::timestamp),
          ($3, 'cliente', '3', 'crear', 'POST', '/clientes',
           jsonb_build_object('nombre', $7::text), NULL, 'remoto', 'sincronizado', $5::timestamp)`,
      [
        idsGrupo[0],
        idsGrupo[1],
        idsGrupo[2],
        `${prefix}-cursor-first`,
        fechaGrupo.fecha,
        `${prefix}-missing-parent`,
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
        lineas: [
          {
            productoNombre: "Línea inicial local",
            cantidad: 1,
            precioVenta: 100,
            precioCompra: 0,
          },
        ],
      },
      `${prefix}-local-create`,
    );
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
        lineas: [
          {
            productoNombre: "Línea inicial remota",
            cantidad: 1,
            precioVenta: 100,
            precioCompra: 0,
          },
        ],
      },
      `${prefix}-remote-create`,
    );
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
          pool.query(
            `DELETE FROM eventos_sincronizacion;
               DELETE FROM operaciones_sincronizadas;
               DELETE FROM referencias_sincronizacion;
               DELETE FROM cursos_sincronizacion;`,
          ),
        ),
      );
    } finally {
      detenerApi(localApi);
      detenerApi(remoteApi);
      await Promise.all([localPool.end(), remotePool.end()]);
    }
  }
});
