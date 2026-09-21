import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import cookieParser from "cookie-parser";
import { capturarCambiosRemotos } from "./middlewares/capturar-cambios-remotos";
import { bloqueoOperacion } from "./middlewares/bloqueo-operacion";
import { bloqueoAccesoRemoto } from "./middlewares/acceso-remoto";

const app: Express = express();

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
  if (!isAllowedOrigin(origin)) {
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
  if (req.path.startsWith("/api")) { next(); return; }
  res.sendFile(path.join(frontendDist, "index.html"));
});

export default app;
