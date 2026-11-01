import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

type PackageManifest = {
  name?: string;
  scripts?: Record<string, string>;
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

async function findPackageManifests(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const manifests: string[] = [];

  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === "dist" ||
      entry.name === "build"
    ) {
      continue;
    }

    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      manifests.push(...await findPackageManifests(path));
    } else if (entry.isFile() && entry.name === "package.json") {
      manifests.push(path);
    }
  }

  return manifests;
}

test("cada comando pnpm run del README existe en su package.json", async () => {
  const readme = await readFile(join(repoRoot, "readme.md"), "utf8");
  const packagePaths = [
    join(repoRoot, "package.json"),
    ...await Promise.all(
      ["artifacts", "lib", "scripts"].map((directory) =>
        findPackageManifests(join(repoRoot, directory))
      ),
    ).then((paths) => paths.flat()),
  ];
  const packages = new Map<string, PackageManifest>();

  for (const path of packagePaths) {
    const manifest = JSON.parse(await readFile(path, "utf8")) as PackageManifest;
    if (manifest.name) packages.set(manifest.name, manifest);
    if (relative(repoRoot, path) === "package.json") {
      packages.set("root", manifest);
    }
  }

  const commands = [
    ...[...readme.matchAll(/pnpm(?:\.cmd)?\s+run\s+([A-Za-z0-9:_-]+)/g)]
      .map((match) => ({
        command: match[0],
        packageName: "root",
        scriptName: match[1]!,
      })),
    ...[...readme.matchAll(
      /pnpm(?:\.cmd)?\s+--filter\s+([^\s`]+)\s+run\s+([A-Za-z0-9:_-]+)/g,
    )].map((match) => ({
      command: match[0],
      packageName: match[1]!,
      scriptName: match[2]!,
    })),
  ];

  assert.ok(commands.length > 0, "No se encontraron comandos pnpm run en readme.md");
  const missing = commands.filter(({ packageName, scriptName }) => {
    const manifest = packages.get(packageName);
    return !manifest?.scripts || !(scriptName in manifest.scripts);
  });

  assert.deepEqual(
    missing,
    [],
    `Comandos que no existen:\n${missing.map(({ command }) => command).join("\n")}`,
  );
});
