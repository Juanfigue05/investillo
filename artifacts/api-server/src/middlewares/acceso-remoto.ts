import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { and, eq, gt, lt } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { sesionesAccesoTable } from "@workspace/db/schema";
import { logger } from "../lib/logger";
import { compararSecretos } from "../lib/secretos";

const CLAVE_ACCESO = process.env.CLAVE_ACCESO_REMOTO;
const SYNC_TOKEN = process.env.SYNC_TOKEN;
const NOMBRE_COOKIE = "investillo_sesion";
const COOKIE_ANTIGUA = "investillo_acceso";
const DURACION_SESION_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_SESION_MS = 60_000;

if (SYNC_TOKEN && Buffer.byteLength(SYNC_TOKEN) < 32) {
  throw new Error("SYNC_TOKEN debe tener al menos 32 bytes");
}

const sesionesValidas = new Map<string, number>();
let asegurarTablaPromise: Promise<void> | undefined;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function asegurarTablaSesiones(): Promise<void> {
  asegurarTablaPromise ??= pool
    .query(
      `
      CREATE TABLE IF NOT EXISTS sesiones_acceso (
        token_hash text PRIMARY KEY,
        creado_en timestamptz NOT NULL DEFAULT now(),
        expira_en timestamptz NOT NULL
      )
    `,
    )
    .then(() => undefined)
    .catch((error: unknown) => {
      asegurarTablaPromise = undefined;
      throw error;
    });
  return asegurarTablaPromise;
}

function esSolicitudSincronizacion(req: Request): boolean {
  return (
    req.path.startsWith("/api/sync/") ||
    req.header("x-sync-apply") === "true" ||
    Boolean(req.header("x-sync-token")) ||
    (req.header("authorization") ?? "").startsWith("Bearer ")
  );
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

export function bloqueoAccesoRemoto(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (esSolicitudSincronizacion(req)) {
    if (!SYNC_TOKEN) {
      res.status(503).json({
        error: "La autenticación de sincronización no está configurada",
      });
      return;
    }
    const autorizacion = req.header("authorization") ?? "";
    const token =
      req.header("x-sync-token") ??
      (autorizacion.startsWith("Bearer ")
        ? autorizacion.slice("Bearer ".length)
        : "");
    if (!token || !compararSecretos(token, SYNC_TOKEN)) {
      res
        .status(401)
        .json({ error: "Autenticación de sincronización requerida" });
      return;
    }
    next();
    return;
  }

  if (!CLAVE_ACCESO) {
    next();
    return;
  } // si no se configuró la clave, no bloquea nada (útil en local)

  if (req.path === "/bloquear" && req.method === "POST") {
    void cerrarSesion(req, res).catch((error: unknown) => {
      logger.error({ err: error }, "No se pudo revocar la sesión de acceso");
      res.status(503).send("No se pudo cerrar la sesión. Inténtalo de nuevo.");
    });
    return;
  }

  // Deja pasar libre el chequeo de "sigo vivo" que usa el robot de GitHub —
  // no muestra ningún dato del negocio, solo confirma que el servidor responde.
  if (req.path === "/api/healthz" || req.path === "/api/healthz-db") {
    next();
    return;
  }

  if (req.path === "/acceso" && req.method === "POST") {
    limitadorAcceso(req, res, (error?: unknown) => {
      if (error) {
        next(error);
        return;
      }
      void iniciarSesion(req, res).catch((inicioError: unknown) => {
        logger.error(
          { err: inicioError },
          "No se pudo iniciar una sesión de acceso",
        );
        res
          .status(503)
          .send(
            HTML_FORMULARIO("No se pudo iniciar sesión. Inténtalo de nuevo."),
          );
      });
    });
    return;
  }

  void validarSesion(req, res)
    .then((valida) => {
      if (valida) {
        next();
        return;
      }
      res.status(401).send(HTML_FORMULARIO());
    })
    .catch((error: unknown) => {
      logger.error({ err: error }, "No se pudo verificar la sesión de acceso");
      res
        .status(503)
        .send("No se pudo verificar el acceso. Inténtalo de nuevo.");
    });
}

const limitadorAcceso = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req, res) => {
    res
      .status(429)
      .send(HTML_FORMULARIO("Demasiados intentos. Espera 15 minutos."));
  },
});

async function iniciarSesion(req: Request, res: Response): Promise<void> {
  const clave = typeof req.body?.clave === "string" ? req.body.clave : "";
  if (!CLAVE_ACCESO || !compararSecretos(clave, CLAVE_ACCESO)) {
    res
      .status(401)
      .send(HTML_FORMULARIO("Clave incorrecta, intenta de nuevo."));
    return;
  }

  await asegurarTablaSesiones();
  const ahora = new Date();
  await db
    .delete(sesionesAccesoTable)
    .where(lt(sesionesAccesoTable.expiraEn, ahora));

  const token = crypto.randomBytes(32).toString("base64url");
  const expiraEn = new Date(ahora.getTime() + DURACION_SESION_MS);
  const tokenHash = hashToken(token);
  await db.insert(sesionesAccesoTable).values({ tokenHash, expiraEn });
  sesionesValidas.set(
    tokenHash,
    Math.min(expiraEn.getTime(), Date.now() + CACHE_SESION_MS),
  );

  res.cookie(NOMBRE_COOKIE, token, {
    path: "/",
    maxAge: DURACION_SESION_MS,
    httpOnly: true,
    secure: req.secure,
    sameSite: "lax",
  });
  res.clearCookie(COOKIE_ANTIGUA, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
  res.redirect("/");
}

async function validarSesion(req: Request, _res: Response): Promise<boolean> {
  const token = req.cookies?.[NOMBRE_COOKIE];
  if (typeof token !== "string" || token.length === 0) return false;
  const tokenHash = hashToken(token);
  const ahora = Date.now();
  const cacheExpiry = sesionesValidas.get(tokenHash);
  if (cacheExpiry !== undefined && cacheExpiry > ahora) return true;
  sesionesValidas.delete(tokenHash);

  await asegurarTablaSesiones();
  const [sesion] = await db
    .select({ expiraEn: sesionesAccesoTable.expiraEn })
    .from(sesionesAccesoTable)
    .where(
      and(
        eq(sesionesAccesoTable.tokenHash, tokenHash),
        gt(sesionesAccesoTable.expiraEn, new Date(ahora)),
      ),
    )
    .limit(1);
  if (!sesion) return false;

  sesionesValidas.set(
    tokenHash,
    Math.min(sesion.expiraEn.getTime(), ahora + CACHE_SESION_MS),
  );
  return true;
}

async function cerrarSesion(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[NOMBRE_COOKIE];
  if (typeof token === "string" && token.length > 0) {
    const tokenHash = hashToken(token);
    await asegurarTablaSesiones();
    await db
      .delete(sesionesAccesoTable)
      .where(eq(sesionesAccesoTable.tokenHash, tokenHash));
    sesionesValidas.delete(tokenHash);
  }
  res.clearCookie(NOMBRE_COOKIE, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
  res.clearCookie(COOKIE_ANTIGUA, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
  res.redirect(303, "/");
}
