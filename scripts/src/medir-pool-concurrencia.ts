import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const apiEntry = join(repoRoot, "artifacts", "api-server", "dist", "index.mjs");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error("Define DATABASE_URL para la base local de pruebas.");

const database = new URL(databaseUrl);
if (
  !["localhost", "127.0.0.1", "::1", "[::1]"].includes(database.hostname) ||
  database.pathname !== "/investillo_test"
) {
  throw new Error(
    "Medición bloqueada: DATABASE_URL debe apuntar a investillo_test en loopback.",
  );
}

type HttpResult = {
  status: number | null;
  durationMs: number;
  bodyText: string;
  error?: string;
};

type BatchResult = {
  requests: number;
  succeeded: number;
  failed: number;
  totalMs: number;
  p50Ms: number;
  p95Ms: number;
  errors: Record<string, number>;
};

const databaseClient = new Client({ connectionString: databaseUrl });
const suffix = randomUUID().replaceAll("-", "");
const functionName = `pool_sleep_${suffix}`;
const triggerName = `pool_trigger_${suffix}`;
const operationIds = new Set<string>();
const values = new Set<string>();
const pauseSeconds = 2;
let triggerCreated = false;
let functionCreated = false;
let serverProcess: ChildProcess | undefined;
let nextValue = Date.now();
let apiOutput = "";

function percentile(samples: number[], fraction: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return Math.round(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0);
}

function portAvailable(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("No se pudo reservar un puerto local para la API."));
        return;
      }
      const { port } = address;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

function readBody(response: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let body = "";
    response.setEncoding("utf8");
    response.on("data", (chunk: string) => {
      body += chunk;
    });
    response.once("end", () => resolveBody(body));
    response.once("error", reject);
  });
}

async function send(
  url: URL,
  method: "GET" | "POST",
  operationId?: string,
  body?: unknown,
): Promise<HttpResult> {
  const started = performance.now();
  return new Promise((resolveResult) => {
    const request = httpRequest(
      url,
      {
        method,
        agent: false,
        headers: {
          ...(operationId ? { "X-Operation-Id": operationId } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
      },
      (response) => {
        void readBody(response).then(
          (responseBody) => {
            let error: string | undefined;
            if ((response.statusCode ?? 500) >= 400) {
              try {
                const parsed = JSON.parse(responseBody) as { error?: unknown };
                error = typeof parsed.error === "string"
                  ? parsed.error
                  : `HTTP ${response.statusCode}`;
              } catch {
                error = `HTTP ${response.statusCode}`;
              }
            }
            resolveResult({
              status: response.statusCode ?? null,
              durationMs: Math.round(performance.now() - started),
              bodyText: responseBody,
              ...(error ? { error } : {}),
            });
          },
          (error: unknown) => resolveResult({
            status: null,
            durationMs: Math.round(performance.now() - started),
            bodyText: "",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      },
    );
    request.setTimeout(30_000, () => request.destroy(new Error("HTTP client timeout")));
    request.once("error", (error) => resolveResult({
      status: null,
      durationMs: Math.round(performance.now() - started),
      bodyText: "",
      error: error.message,
    }));
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

function summarize(results: HttpResult[], totalMs: number): BatchResult {
  const errors: Record<string, number> = {};
  for (const result of results) {
    if (result.status !== null && result.status >= 200 && result.status < 300) continue;
    const label = result.error ?? `HTTP ${result.status ?? "sin respuesta"}`;
    errors[label] = (errors[label] ?? 0) + 1;
  }
  const latencies = results.map((result) => result.durationMs);
  const succeeded = results.length - Object.values(errors).reduce((sum, count) => sum + count, 0);
  return {
    requests: results.length,
    succeeded,
    failed: results.length - succeeded,
    totalMs: Math.round(totalMs),
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    errors,
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

async function startApi(port: number): Promise<void> {
  serverProcess = spawn(process.execPath, [apiEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PORT: String(port),
      NODE_ENV: "production",
      DISABLE_BACKGROUND_JOBS: "true",
      LOG_LEVEL: "error",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  for (const stream of [serverProcess.stdout, serverProcess.stderr]) {
    stream?.on("data", (chunk: Buffer) => {
      apiOutput = `${apiOutput}${chunk.toString()}`.slice(-50_000);
    });
  }

  const healthUrl = new URL("/api/healthz", `http://127.0.0.1:${port}`);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`La API terminó durante el arranque (${serverProcess.exitCode}).`);
    }
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error("La API local no respondió /api/healthz en 15 segundos.");
}

async function runDifferentOperations(
  apiUrl: URL,
  count: number,
  readDuringWrites = false,
): Promise<{ writes: BatchResult; read?: HttpResult }> {
  const started = performance.now();
  const resultsPromise = Promise.all(
    Array.from({ length: count }, () => {
      const operationId = randomUUID();
      operationIds.add(operationId);
      const value = String(nextValue++);
      values.add(value);
      return send(
        new URL("/api/tensionadas", apiUrl),
        "POST",
        operationId,
        { fecha: "2099-12-31", valor: Number(value) },
      );
    }),
  );
  let read: HttpResult | undefined;
  if (readDuringWrites) {
    await sleep(100);
    read = await send(new URL("/api/tensionadas", apiUrl), "GET");
  }
  const results = await resultsPromise;
  const totalMs = performance.now() - started;
  return { writes: summarize(results, totalMs), ...(read ? { read } : {}) };
}

async function runRepeatedOperation(apiUrl: URL): Promise<{
  batch: BatchResult;
  sameStatus: boolean;
  sameBody: boolean;
  dataRows: number;
  eventRows: number;
  operationRows: number;
}> {
  const operationId = randomUUID();
  operationIds.add(operationId);
  const value = String(nextValue++);
  values.add(value);
  const body = { fecha: "2099-12-31", valor: Number(value) };
  const started = performance.now();
  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      send(new URL("/api/tensionadas", apiUrl), "POST", operationId, body),
    ),
  );
  const batch = summarize(results, performance.now() - started);
  const rows = await databaseClient.query<{ data: string; events: string; operations: string }>(
    `SELECT
       (SELECT count(*)::text FROM tensionadas WHERE valor = $2::numeric) AS data,
       (SELECT count(*)::text FROM eventos_sincronizacion WHERE operation_id = $1) AS events,
       (SELECT count(*)::text FROM operaciones_sincronizadas WHERE operation_id = $1) AS operations`,
    [operationId, value],
  );
  const first = results[0];
  const allSuccessful = results.every(
    (result) => result.status !== null && result.status >= 200 && result.status < 300,
  );
  const sameStatus = allSuccessful && results.every(
    (result) => result.status === first?.status,
  );
  const sameBody = allSuccessful && first !== undefined && results.every(
    (result) => result.bodyText === first.bodyText,
  );
  return {
    batch,
    sameStatus,
    sameBody,
    dataRows: Number(rows.rows[0]?.data ?? 0),
    eventRows: Number(rows.rows[0]?.events ?? 0),
    operationRows: Number(rows.rows[0]?.operations ?? 0),
  };
}

async function cleanup(): Promise<void> {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill();
    await new Promise<void>((resolveExit) => {
      serverProcess?.once("exit", () => resolveExit());
      setTimeout(resolveExit, 5_000).unref();
    });
  }
  if (triggerCreated) {
    await databaseClient.query(
      `DROP TRIGGER IF EXISTS "${triggerName}" ON tensionadas`,
    );
  }
  if (functionCreated) {
    await databaseClient.query(`DROP FUNCTION IF EXISTS "${functionName}"()`);
  }
  const operations = [...operationIds];
  if (operations.length) {
    await databaseClient.query(
      "DELETE FROM eventos_sincronizacion WHERE operation_id = ANY($1::text[])",
      [operations],
    );
    await databaseClient.query(
      "DELETE FROM operaciones_sincronizadas WHERE operation_id = ANY($1::text[])",
      [operations],
    );
  }
  const testValues = [...values];
  if (testValues.length) {
    await databaseClient.query(
      "DELETE FROM tensionadas WHERE valor = ANY($1::numeric[])",
      [testValues],
    );
  }
}

async function main(): Promise<void> {
  await databaseClient.connect();
  const port = await portAvailable();
  try {
    await databaseClient.query(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_sleep(${pauseSeconds});
        RETURN NEW;
      END;
      $$
    `);
    functionCreated = true;
    await databaseClient.query(
      `CREATE TRIGGER "${triggerName}" BEFORE INSERT ON tensionadas
       FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`,
    );
    triggerCreated = true;
    await startApi(port);
    const apiUrl = new URL("/", `http://127.0.0.1:${port}`);
    const batches: Record<number, BatchResult> = {};
    for (const count of [5, 10, 11, 12, 20, 40]) {
      batches[count] = (await runDifferentOperations(apiUrl, count)).writes;
    }
    const repeatedOperation = await runRepeatedOperation(apiUrl);
    const readWithWrites = await runDifferentOperations(apiUrl, 11, true);
    const serverErrors = apiOutput
      .split(/\r?\n/)
      .flatMap((line) => {
        try {
          const entry = JSON.parse(line) as {
            level?: number;
            msg?: string;
            err?: { message?: string };
          };
          if ((entry.level ?? 0) < 50) return [];
          return [entry.err?.message ?? entry.msg ?? "Error de API sin mensaje"];
        } catch {
          return [];
        }
      });
    console.log(JSON.stringify({
      database: "investillo_test (loopback only)",
      artificialInsertDelaySeconds: pauseSeconds,
      differentOperationIds: batches,
      sameOperationId20Requests: repeatedOperation,
      getDuring11Writes: {
        writes: readWithWrites.writes,
        get: readWithWrites.read,
      },
      serverErrors: [...new Set(serverErrors)],
    }, null, 2));
  } finally {
    await cleanup();
    await databaseClient.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
