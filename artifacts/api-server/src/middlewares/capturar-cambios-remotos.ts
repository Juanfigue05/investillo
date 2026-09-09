import type { RequestHandler } from "express";
import { db } from "@workspace/db";
import { eventosSincronizacionTable } from "@workspace/db/schema";

const METODOS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Registra cambios hechos directamente en la instancia remota para poder descargarlos localmente. */
export const capturarCambiosRemotos: RequestHandler = (req, res, next) => {
  if (process.env.SYNC_CAPTURE_REMOTE !== "true" || !METODOS.has(req.method) || req.header("x-sync-apply")) {
    next();
    return;
  }

  res.once("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300 || req.path.startsWith("/sync/")) return;
    const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
    void db.insert(eventosSincronizacionTable).values({
      operationId,
      entidad: "api",
      entidadId: req.path,
      tipo: req.method,
      metodo: req.method,
      endpoint: req.originalUrl.replace(/^\/api/, ""),
      payload: req.body ?? {},
      origen: "remoto",
      estado: "sincronizado",
      procesadoEn: new Date(),
    }).onConflictDoUpdate({
      target: eventosSincronizacionTable.operationId,
      set: {
        origen: "remoto",
        estado: "sincronizado",
        procesadoEn: new Date(),
        payload: req.body ?? {},
        endpoint: req.originalUrl.replace(/^\/api/, ""),
        metodo: req.method,
      },
    }).catch((error) => console.error("No se pudo registrar cambio remoto:", error));
  });
  next();
};