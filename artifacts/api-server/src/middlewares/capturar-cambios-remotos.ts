import type { RequestHandler } from "express";
import { db } from "@workspace/db";
import { eventosSincronizacionTable } from "@workspace/db/schema";
import { logger } from "../lib/logger";

const METODOS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Registra cambios hechos directamente en la instancia remota para poder descargarlos localmente. */
export const capturarCambiosRemotos: RequestHandler = (req, res, next) => {
  if (process.env.SYNC_CAPTURE_REMOTE !== "true" || !METODOS.has(req.method) || req.header("x-sync-apply")) {
    next();
    return;
  }

  if (!req.header("x-operation-id")) {
    req.headers["x-operation-id"] = crypto.randomUUID();
  }

  res.once("finish", () => {
    void (async () => {
      try {
        const ruta = req.originalUrl.split("?")[0] ?? "";
        if (
          res.statusCode < 200 ||
          res.statusCode >= 300 ||
          ruta.startsWith("/api/sync/")
        ) return;
        const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
        const payload = JSON.parse(JSON.stringify(req.body ?? {})) as Record<
          string,
          unknown
        >;
        await db.insert(eventosSincronizacionTable).values({
          operationId,
          entidad: "api",
          entidadId: req.path,
          tipo: req.method,
          metodo: req.method,
          endpoint: req.originalUrl.replace(/^\/api/, ""),
          payload,
          origen: "remoto",
          estado: "sincronizado",
          procesadoEn: new Date(),
        }).onConflictDoUpdate({
          target: eventosSincronizacionTable.operationId,
          set: {
            origen: "remoto",
            estado: "sincronizado",
            procesadoEn: new Date(),
          },
        });
      } catch (error) {
        logger.error({ err: error }, "No se pudo registrar cambio remoto");
      }
    })();
  });
  next();
};