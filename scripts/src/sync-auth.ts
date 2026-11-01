export function getSyncHeaders(): Record<string, string> {
  const token = process.env.SYNC_TOKEN;
  if (!token) {
    throw new Error(
      "Falta SYNC_TOKEN; configura el mismo token en Render y en .env.local",
    );
  }
  if (Buffer.byteLength(token) < 32) {
    throw new Error("SYNC_TOKEN debe tener al menos 32 bytes");
  }
  return { "X-Sync-Token": token };
}
