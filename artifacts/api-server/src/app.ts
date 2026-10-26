import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import cookieParser from "cookie-parser";
import { capturarCambiosRemotos } from "./middlewares/capturar-cambios-remotos";
import { bloqueoOperacion } from "./middlewares/bloqueo-operacion";
import { bloqueoAccesoRemoto } from "./middlewares/acceso-remoto";

const app: Express = express();
const trustProxyHops = process.env.TRUST_PROXY_HOPS;
if (
  process.env.NODE_ENV === "production" &&
  process.env.CLAVE_ACCESO_REMOTO &&
  trustProxyHops === undefined
) {
  throw new Error("TRUST_PROXY_HOPS es obligatorio en producción");
}
if (trustProxyHops !== undefined) {
  const hops = Number(trustProxyHops);
  if (!Number.isSafeInteger(hops) || hops < 0) {
    throw new Error("TRUST_PROXY_HOPS debe ser un entero mayor o igual a 0");
  }
  app.set("trust proxy", hops);
}

app.use(
  helmet({
    contentSecurityPolicy: false,
    referrerPolicy: { policy: "same-origin" },
  }),
);

const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function isAllowedOrigin(origin: string | undefined): boolean {
  // Requests without Origin include same-origin navigation and server-to-server calls.
  return !origin || allowedOrigins.has(origin);
}

function isSameOrigin(req: express.Request): boolean {
  const origin = req.header("origin");
  if (!origin) return true;
  return origin === `${req.protocol}://${req.get("host")}`;
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use((req, res, next) => {
  const origin = req.header("origin");
  if (!isAllowedOrigin(origin) && !isSameOrigin(req)) {
    res.status(403).json({ error: "Origen no permitido" });
    return;
  }
  next();
});
app.use(
  cors({
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(cookieParser());
app.use(bloqueoAccesoRemoto);

app.use(capturarCambiosRemotos);
app.use(bloqueoOperacion);
app.use("/api", router);

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.join(__dirname, "../../gestion/dist/public");

app.use(express.static(frontendDist));
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    next();
    return;
  }
  res.sendFile(path.join(frontendDist, "index.html"));
});

const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const status =
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 500
      ? error.status
      : error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "LIMIT_FILE_SIZE"
        ? 413
        : 500;
  req.log.error({ err: error, status }, "Request failed");
  res.status(status).json({
    error:
      status === 413
        ? "El archivo supera el tamaño permitido"
        : status < 500
          ? "Solicitud inválida"
          : "Error interno del servidor",
  });
};

app.use(errorHandler);

export default app;
