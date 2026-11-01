const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "Las pruebas de integración requieren DATABASE_URL de investillo_test local",
  );
}

let database: URL;
try {
  database = new URL(databaseUrl);
} catch {
  throw new Error("DATABASE_URL de pruebas debe ser una URL válida");
}

const hostsLocales = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const basesDePruebaPermitidas = new Set([
  "/investillo_test",
  "/investillo_test_aiven",
]);
if (
  !hostsLocales.has(database.hostname) ||
  !basesDePruebaPermitidas.has(database.pathname)
) {
  throw new Error(
    "Pruebas bloqueadas: DATABASE_URL debe apuntar a una base local de pruebas permitida",
  );
}
