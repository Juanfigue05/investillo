import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Falta DATABASE_URL en .env.local");

const backupDir = path.resolve(process.env.LOCAL_BACKUP_DIR || "backups/local");
const retentionDays = Number(process.env.LOCAL_BACKUP_RETENTION_DAYS || 30);
const pgDump = process.env.PG_DUMP_PATH || "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe";
const parsed = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));

await mkdir(backupDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = path.join(backupDir, `investillo_local_${timestamp}.dump`);

await execFileAsync(pgDump, ["--format=custom", "--file", output, databaseUrl], {
  windowsHide: true,
});
console.log(`Respaldo local creado para ${databaseName}: ${output}`);

const limite = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
for (const nombre of await readdir(backupDir)) {
  if (!nombre.endsWith(".dump")) continue;
  const archivo = path.join(backupDir, nombre);
  if ((await stat(archivo)).mtimeMs < limite) {
    await unlink(archivo);
    console.log(`Respaldo local antiguo eliminado: ${nombre}`);
  }
}