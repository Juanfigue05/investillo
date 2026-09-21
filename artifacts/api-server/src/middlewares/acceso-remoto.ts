import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const CLAVE_ACCESO = process.env.CLAVE_ACCESO_REMOTO; // se define en Render, no en tu red local
const NOMBRE_COOKIE = "investillo_acceso";
const UN_ANIO_MS = 365 * 24 * 60 * 60 * 1000;

function hashClave(clave: string): string {
  return crypto.createHash("sha256").update(clave).digest("hex");
}

const HTML_FORMULARIO = (error?: string) => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Investillo — Acceso</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0a0e1a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    form { background: #111827; padding: 2rem; border-radius: 16px; width: 90%; max-width: 320px; box-shadow: 0 10px 30px rgba(0,0,0,.4); }
    h1 { font-size: 1.1rem; margin: 0 0 1rem; }
    input { width: 100%; box-sizing: border-box; padding: .7rem 1rem; border-radius: 10px; border: 1px solid #334155; background: #0a0e1a; color: white; font-size: 1rem; margin-bottom: .75rem; }
    button { width: 100%; padding: .7rem; border-radius: 10px; border: none; background: #3b82f6; color: white; font-weight: 600; font-size: 1rem; cursor: pointer; }
    p.error { color: #f87171; font-size: .85rem; margin: -0.4rem 0 .75rem; }
  </style>
</head>
<body>
  <form method="POST" action="/acceso">
    <h1>🔒 Clave de acceso</h1>
    ${error ? `<p class="error">${error}</p>` : ""}
    <input type="password" name="clave" placeholder="Clave de acceso" autofocus required />
    <button type="submit">Entrar</button>
  </form>
</body>
</html>`;

export function bloqueoAccesoRemoto(req: Request, res: Response, next: NextFunction) {
  if (!CLAVE_ACCESO) { next(); return; } // si no se configuró la clave, no bloquea nada (útil en local)

  if (req.path === "/acceso" && req.method === "POST") {
    const clave = (req.body?.clave || "").toString();
    if (clave === CLAVE_ACCESO) {
      res.cookie(NOMBRE_COOKIE, hashClave(clave), {
        maxAge: UN_ANIO_MS,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      });
      res.redirect("/");
      return;
    }
    res.status(401).send(HTML_FORMULARIO("Clave incorrecta, intenta de nuevo."));
    return;
  }

  const cookie = req.cookies?.[NOMBRE_COOKIE];
  if (cookie === hashClave(CLAVE_ACCESO)) { next(); return; }

  res.status(401).send(HTML_FORMULARIO());
}