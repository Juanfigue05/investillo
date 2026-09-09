import { Router } from "express";
import { db } from "@workspace/db";
import { calculadoraCierreTable, eventosSincronizacionTable, operacionesSincronizadasTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res) => {
  const [fila] = await db.select().from(calculadoraCierreTable).where(eq(calculadoraCierreTable.id, 1));
  res.json(fila?.datos ?? {});
});

router.put("/", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  const datos = req.body && typeof req.body === "object" ? req.body : {};
  await db.transaction(async (tx) => { await tx.insert(calculadoraCierreTable)
    .values({ id: 1, datos, actualizadoEn: new Date() })
    .onConflictDoUpdate({
      target: calculadoraCierreTable.id,
      set: { datos, actualizadoEn: new Date() },
    });
    if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "calculadora_cierre", entidadId: "1", tipo: "guardar", metodo: "PUT", endpoint: "/calculadora-cierre", payload: req.body, origen: "local" });
    await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "calculadora_cierre", recursoId: 1 }).onConflictDoNothing();
  });
  res.json({ ok: true });
});

router.delete("/", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  await db.transaction(async (tx) => { await tx.insert(calculadoraCierreTable)
    .values({ id: 1, datos: {}, actualizadoEn: new Date() })
    .onConflictDoUpdate({
      target: calculadoraCierreTable.id,
      set: { datos: {}, actualizadoEn: new Date() },
    });
    if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "calculadora_cierre", entidadId: "1", tipo: "borrar", metodo: "DELETE", endpoint: "/calculadora-cierre", payload: {}, origen: "local" });
    await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "calculadora_cierre", recursoId: 1 }).onConflictDoNothing();
  });
  res.json({ ok: true });
});

export default router;
