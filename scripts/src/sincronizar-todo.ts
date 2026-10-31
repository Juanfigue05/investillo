import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function ejecutarScript(nombre: string): number {
  const resultado = spawnSync(
    process.execPath,
    ["--import", "tsx", join("src", nombre)],
    { cwd: scriptsRoot, stdio: "inherit" },
  );
  if (resultado.error) throw resultado.error;
  return resultado.status ?? 1;
}

const subida = ejecutarScript("sincronizar-local.ts");
if (subida === 1 || subida === 2) {
  process.exitCode = subida;
} else {
  const descarga = ejecutarScript("sincronizar-remoto.ts");
  process.exitCode = Math.max(subida, descarga);
}
