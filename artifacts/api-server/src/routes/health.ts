import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { productosTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Esta ruta sí consulta la base de datos de verdad — para que el ping de "keep-alive"
// también cuente como actividad ante Supabase, y nunca se pause por inactividad.
router.get("/healthz-db", async (req, res) => {
  try {
    await db.select({ count: sql<number>`count(*)` }).from(productosTable);
    res.json({ status: "ok", db: "activa" });
  } catch (err) {
    req.log.error({ err }, "Database health check failed");
    res.status(500).json({ status: "error", error: "Base de datos no disponible" });
  }
});

export default router;