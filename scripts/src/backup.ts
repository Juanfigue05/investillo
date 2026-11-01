import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { validarDestinoBackup } from "./lib/backup-destino";

const esWindows = platform() === "win32";
const PG_BIN = process.env.PG_BIN_PATH;
const PG_BIN_LINUX = "/usr/lib/postgresql/18/bin";
// En Windows (tu portátil) usa la ruta de siempre si no se define otra cosa.
// En Linux (GitHub Actions) usa "pg_dump"/"pg_restore" directo, ya instalados en el PATH del sistema.
const PG_DUMP = PG_BIN
  ? join(PG_BIN, esWindows ? "pg_dump.exe" : "pg_dump")
  : esWindows
    ? "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe"
    : existsSync(join(PG_BIN_LINUX, "pg_dump")) ? join(PG_BIN_LINUX, "pg_dump") : "pg_dump";
const PG_RESTORE = PG_BIN
  ? join(PG_BIN, esWindows ? "pg_restore.exe" : "pg_restore")
  : esWindows
    ? "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_restore.exe"
    : existsSync(join(PG_BIN_LINUX, "pg_restore")) ? join(PG_BIN_LINUX, "pg_restore") : "pg_restore";

function verificarVersionPostgres(binario: string) {
  const version = execFileSync(binario, ["--version"], { encoding: "utf8" }).trim();
  const match = version.match(/(?:PostgreSQL|pg_dump|pg_restore)[^\d]*(\d+)/i);
  const major = match ? Number(match[1]) : 0;
  if (major < 18) {
    throw new Error(`Se requiere PostgreSQL 18 o superior. Se encontró ${version} usando ${binario}.`);
  }
  console.log(`${binario}: ${version}`);
}

const SOURCE_URL = process.env.SOURCE_DATABASE_URL; // AIVEN (producción)
const AIVEN_URL = process.env.AIVEN_DATABASE_URL; // APUTA A SUPABASE

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;

if (!SOURCE_URL) throw new Error("Falta SOURCE_DATABASE_URL en el .env");
if (AIVEN_URL) validarDestinoBackup(SOURCE_URL, AIVEN_URL);

const BACKUP_DIR = join(process.cwd(), "backups");
mkdirSync(BACKUP_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const fileName = `investillo_${timestamp}.dump`;
const filePath = join(BACKUP_DIR, fileName);
type Paso = { estado: "pendiente" | "completo" | "fallido" | "omitido"; detalle?: string };
const pasos: Record<"local" | "replica" | "r2", Paso> = {
  local: { estado: "pendiente" },
  replica: { estado: "pendiente" },
  r2: { estado: "pendiente" },
};

function detalleSeguro(error: unknown): string {
  const mensaje = error instanceof Error ? error.message : String(error);
  return mensaje.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[URL oculta]");
}

function informarPaso(nombre: string, paso: Paso): void {
  const detalle = paso.detalle ? ` — ${paso.detalle}` : "";
  console.log(`${nombre}: ${paso.estado}${detalle}`);
}

try {
  console.log("[1/3] Generando y validando respaldo local desde Aiven...");
  console.log(`Usando pg_dump: ${PG_DUMP}`);
  verificarVersionPostgres(PG_DUMP);
  verificarVersionPostgres(PG_RESTORE);
  execFileSync(
    PG_DUMP,
    [
      `--dbname=${SOURCE_URL}`,
      "--schema=public",
      "--no-owner",
      "--no-privileges",
      "-F",
      "c",
      "-f",
      filePath,
    ],
    { stdio: "inherit" },
  );

  const { statSync } = await import("node:fs");
  const stats = statSync(filePath);
  const TAMANO_MINIMO_ESPERADO = 10 * 1024;
  if (stats.size < TAMANO_MINIMO_ESPERADO) {
    throw new Error(`El archivo parece incompleto (${stats.size} bytes; mínimo 10240).`);
  }
  pasos.local = {
    estado: "completo",
    detalle: `archivo verificado (${(stats.size / 1024 / 1024).toFixed(2)} MB)`,
  };
} catch (error) {
  pasos.local = { estado: "fallido", detalle: detalleSeguro(error) };
}

if (pasos.local.estado === "completo" && AIVEN_URL) {
  console.log("[2/3] Restaurando respaldo en la réplica Supabase...");
  try {
    execFileSync(
      PG_RESTORE,
      [
        `--dbname=${AIVEN_URL}`,
        "--clean",
        "--if-exists",
        "--no-owner",
        filePath,
      ],
      { stdio: "inherit" },
    );
    pasos.replica = { estado: "completo" };
  } catch (error) {
    pasos.replica = { estado: "fallido", detalle: detalleSeguro(error) };
  }
} else if (!AIVEN_URL) {
  pasos.replica = { estado: "omitido", detalle: "AIVEN_DATABASE_URL no definido" };
} else {
  pasos.replica = { estado: "omitido", detalle: "no hay un respaldo local válido" };
}

if (pasos.local.estado === "completo" && R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET) {
  console.log("[3/3] Subiendo respaldo a Cloudflare R2...");
  try {
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: fileName,
        Body: readFileSync(filePath),
      }),
    );

    const COPIAS_A_CONSERVAR = 6;
    const lista = await s3.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: "investillo_" }));
    const objetos = (lista.Contents ?? [])
      .filter((o) => o.Key && o.LastModified)
      .sort((a, b) => b.LastModified!.getTime() - a.LastModified!.getTime());
    const aBorrar = objetos.slice(COPIAS_A_CONSERVAR);
    for (const obj of aBorrar) {
      await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key! }));
    }
    pasos.r2 = {
      estado: "completo",
      detalle: `subido; ${Math.min(COPIAS_A_CONSERVAR, objetos.length)} respaldos conservados, ${aBorrar.length} eliminados`,
    };
  } catch (error) {
    pasos.r2 = { estado: "fallido", detalle: detalleSeguro(error) };
  }
} else if (!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET)) {
  pasos.r2 = { estado: "omitido", detalle: "faltan variables de R2" };
} else {
  pasos.r2 = { estado: "omitido", detalle: "no hay un respaldo local válido" };
}

console.log("\nResumen del respaldo:");
informarPaso("Local", pasos.local);
informarPaso("Réplica", pasos.replica);
informarPaso("R2", pasos.r2);

if (Object.values(pasos).some((paso) => paso.estado === "fallido")) {
  process.exitCode = 1;
} else {
  console.log("Respaldo completado sin fallos en los pasos ejecutados.");
}
