import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";

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

const BACKUP_DIR = join(process.cwd(), "backups");
mkdirSync(BACKUP_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const fileName = `investillo_${timestamp}.dump`;
const filePath = join(BACKUP_DIR, fileName);

console.log("[1/3] Generando respaldo desde Supabase...");
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
console.log(`Respaldo local guardado en ${filePath}`);

const { statSync } = await import("node:fs");
const stats = statSync(filePath);
const TAMANO_MINIMO_ESPERADO = 10 * 1024; // 10 KB — un respaldo real de tu base de datos siempre pesa más que esto
if (stats.size < TAMANO_MINIMO_ESPERADO) {
  throw new Error(
    `⚠️ El archivo de respaldo se ve sospechosamente pequeño (${stats.size} bytes) — puede estar vacío o corrupto. Revisa manualmente antes de confiar en este respaldo.`,
  );
}
console.log(
  `✅ Verificado: el archivo pesa ${(stats.size / 1024 / 1024).toFixed(2)} MB — tamaño razonable.`,
);

if (AIVEN_URL) {
  console.log("[2/3] Restaurando respaldo en Aiven...");
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
    console.log("Restaurado en Aiven correctamente.");
  } catch (err) {
    console.error("No se pudo restaurar en Aiven:", err);
  }
} else {
  console.log("[2/3] AIVEN_DATABASE_URL no definido, se omite.");
}

if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET) {
  console.log("[3/3] Subiendo respaldo a Cloudflare R2...");
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
  console.log("Subido a Cloudflare R2 correctamente.");

  // Limpieza automática: conserva solo las N copias MÁS RECIENTES, borra todo lo demás.
  const COPIAS_A_CONSERVAR = 6;
  const lista = await s3.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: "investillo_" }));
  const objetos = (lista.Contents ?? [])
    .filter((o) => o.Key && o.LastModified)
    .sort((a, b) => b.LastModified!.getTime() - a.LastModified!.getTime()); // más nuevo primero

  const aBorrar = objetos.slice(COPIAS_A_CONSERVAR); // todo lo que sobre después de las primeras N
  for (const obj of aBorrar) {
    await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key! }));
  }
  console.log(`🧹 Limpieza en R2: se conservan las ${Math.min(COPIAS_A_CONSERVAR, objetos.length)} más recientes, se eliminaron ${aBorrar.length}.`);
} else {
  console.log("[3/3] Variables de R2 no definidas, se omite.");
}

console.log("✅ Respaldo completo (local + Aiven + R2).");
