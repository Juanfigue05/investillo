import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { eventosSincronizacionTable, operacionesSincronizadasTable, tensionadasTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { operacionYaProcesada } from "./lib/operacion-sincronizada";

const router: IRouter = Router();

router.get("/", async (_req, res) => {
  const rows = await db.select().from(tensionadasTable).orderBy(desc(tensionadasTable.fecha));
  res.json(rows);
});

router.post("/", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const { fecha, valor } = req.body as { fecha: string; valor: number };
  const resultado = await db.transaction(async (tx) => {
    const ya = await operacionYaProcesada(tx, operationId);
    if (ya) return { yaProcesado: ya } as const;
    if (!fecha || !valor) return { error: "Fecha y valor son obligatorios" } as const;
    const [row] = await tx.insert(tensionadasTable).values({ fecha, valor: String(valor) }).returning();
    if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "tensionada", entidadId: String(row.id), tipo: "crear", metodo: "POST", endpoint: "/tensionadas", payload: req.body, origen: "local" });
    await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "tensionada", recursoId: row.id }).onConflictDoNothing();
    return { row } as const;
  });
  if (resultado.yaProcesado) {
    res.status(200).json({ ok: true, yaProcesado: true, recursoId: resultado.yaProcesado.recursoId });
    return;
  }
  if ("error" in resultado) { res.status(400).json({ error: resultado.error }); return; }
  res.json(resultado.row);
});

router.patch("/:id", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = Number.parseInt(req.params.id, 10);
  const { fecha, valor } = req.body as { fecha?: string; valor?: number };
  try {
    const resultado = await db.transaction(async (tx) => {
      const ya = await operacionYaProcesada(tx, operationId);
      if (ya) return { yaProcesado: ya } as const;
      if (!Number.isInteger(id) || id <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || "")) || valor === undefined || !Number.isFinite(Number(valor))) {
        return { error: "Fecha y valor son obligatorios", status: 400 } as const;
      }
      const [row] = await tx.update(tensionadasTable)
        .set({ fecha: String(fecha), valor: String(Number(valor)) })
        .where(eq(tensionadasTable.id, id))
        .returning();
      if (!row) return { error: "Tensionada no encontrada", status: 404 } as const;
      if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "tensionada", entidadId: String(id), tipo: "actualizar", metodo: "PATCH", endpoint: `/tensionadas/${id}`, payload: req.body, origen: "local" });
      await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "tensionada", recursoId: id }).onConflictDoNothing();
      return { row } as const;
    });
    if (resultado.yaProcesado) {
      res.status(200).json({ ok: true, yaProcesado: true, recursoId: resultado.yaProcesado.recursoId });
      return;
    }
    if (resultado.status !== undefined) { res.status(resultado.status).json({ error: resultado.error }); return; }
    res.json(resultado.row);
  } catch (error) {
    res.status(500).json({ error: `No se pudo guardar la tensionada: ${String(error)}` });
  }
});

router.delete("/:id", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = parseInt(req.params.id);
  const resultado = await db.transaction(async (tx) => {
    const ya = await operacionYaProcesada(tx, operationId);
    if (ya) return { yaProcesado: ya } as const;
    await tx.delete(tensionadasTable).where(eq(tensionadasTable.id, id));
    if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "tensionada", entidadId: String(id), tipo: "eliminar", metodo: "DELETE", endpoint: `/tensionadas/${id}`, payload: {}, origen: "local" });
    await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "tensionada", recursoId: id }).onConflictDoNothing();
    return { eliminada: true } as const;
  });
  if (resultado.yaProcesado) {
    res.status(200).json({ ok: true, yaProcesado: true, recursoId: resultado.yaProcesado.recursoId });
    return;
  }
  res.json({ ok: true });
});

export default router;