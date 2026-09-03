import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const PG_BIN = process.env.PG_BIN_PATH ?? "C:\\Program Files\\PostgreSQL\\16\\bin";
const PG_DUMP = join(PG_BIN, "pg_dump.exe");
const PG_RESTORE = join(PG_BIN, "pg_restore.exe");

const SOURCE_URL = process.env.SOURCE_DATABASE_URL; // Supabase (producción)
const AIVEN_URL = process.env.AIVEN_DATABASE_URL;   // Capa 2

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
execFileSync(
  PG_DUMP,
  [
    `--dbname=${SOURCE_URL}`,
    "--schema=public",
    "--no-owner",
    "--no-privileges",
    "-F", "c",
    "-f", filePath,
  ],
  { stdio: "inherit" }
);
console.log(`Respaldo local guardado en ${filePath}`);

const { statSync } = await import("node:fs");
const stats = statSync(filePath);
const TAMANO_MINIMO_ESPERADO = 10 * 1024; // 10 KB — un respaldo real de tu base de datos siempre pesa más que esto
if (stats.size < TAMANO_MINIMO_ESPERADO) {
  throw new Error(`⚠️ El archivo de respaldo se ve sospechosamente pequeño (${stats.size} bytes) — puede estar vacío o corrupto. Revisa manualmente antes de confiar en este respaldo.`);
}
console.log(`✅ Verificado: el archivo pesa ${(stats.size / 1024 / 1024).toFixed(2)} MB — tamaño razonable.`);

if (AIVEN_URL) {
  console.log("[2/3] Restaurando respaldo en Aiven...");
  try {
    execFileSync(
      PG_RESTORE,
      [`--dbname=${AIVEN_URL}`, "--clean", "--if-exists", "--no-owner", filePath],
      { stdio: "inherit" }
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
    })
  );
  console.log("Subido a Cloudflare R2 correctamente.");
} else {
  console.log("[3/3] Variables de R2 no definidas, se omite.");
}

console.log("✅ Respaldo completo (local + Aiven + R2).");