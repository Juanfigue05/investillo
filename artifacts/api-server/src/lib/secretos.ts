import crypto from "node:crypto";

function digest(value: string): Buffer {
  return crypto.createHash("sha256").update(value).digest();
}

export function compararSecretos(a: string, b: string): boolean {
  return crypto.timingSafeEqual(digest(a), digest(b));
}
