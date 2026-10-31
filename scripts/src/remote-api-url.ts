export function getRemoteApiUrl(): string {
  const configuredUrl = process.env.SYNC_REMOTE_API_URL?.replace(/\/+$/, "");
  if (!configuredUrl) {
    throw new Error("SYNC_REMOTE_API_URL es obligatorio");
  }

  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error("SYNC_REMOTE_API_URL debe ser una URL válida");
  }

  if (
    url.pathname.replace(/\/+$/, "") !== "/api" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    configuredUrl.includes("TU-SERVICIO") ||
    configuredUrl.includes("example.com")
  ) {
    throw new Error(
      "SYNC_REMOTE_API_URL debe ser la URL del API remoto y terminar en /api",
    );
  }

  if (url.protocol === "https:") return configuredUrl;

  const hostLocal = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (
    url.protocol === "http:" &&
    process.env.SYNC_TEST_ALLOW_LOCAL_HTTP === "true" &&
    hostLocal.has(url.hostname)
  ) {
    return configuredUrl;
  }

  throw new Error(
    "SYNC_REMOTE_API_URL debe usar HTTPS; HTTP solo se permite para pruebas explícitas en loopback",
  );
}
