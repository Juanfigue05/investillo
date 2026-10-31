export function mismoDestinoPostgres(origen: string, destino: string): boolean {
  const urlOrigen = new URL(origen);
  const urlDestino = new URL(destino);
  const protocoloValido = (protocol: string) =>
    protocol === "postgres:" || protocol === "postgresql:";
  const normalizarHost = (hostname: string) => {
    const host = hostname.toLowerCase().replace(/\.$/, "");
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)
      ? "loopback"
      : host;
  };

  if (!protocoloValido(urlOrigen.protocol) || !protocoloValido(urlDestino.protocol)) {
    throw new Error("Las URLs de backup deben usar PostgreSQL.");
  }

  return (
    normalizarHost(urlOrigen.hostname) === normalizarHost(urlDestino.hostname) &&
    (urlOrigen.port || "5432") === (urlDestino.port || "5432") &&
    decodeURIComponent(urlOrigen.pathname.slice(1)) ===
      decodeURIComponent(urlDestino.pathname.slice(1))
  );
}

export function validarDestinoBackup(origen: string, destino: string): void {
  if (mismoDestinoPostgres(origen, destino)) {
    throw new Error(
      "La base de destino del respaldo coincide con la base de origen; se canceló para evitar borrar la base original.",
    );
  }
}
