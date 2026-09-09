import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { eventosSincronizacionTable, notasTable, operacionesSincronizadasTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  let [notas] = await db.select().from(notasTable);
  if (!notas) {
    [notas] = await db.insert(notasTable).values({ contenido: "" }).returning();
  }
  res.json({ id: notas.id, contenido: notas.contenido, actualizadoEn: notas.actualizadoEn });
});

router.put("/", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  const { contenido } = req.body;
  const notas = await db.transaction(async (tx) => {
    let [row] = await tx.select().from(notasTable);
    if (!row) {
      [row] = await tx.insert(notasTable).values({ contenido: contenido || "" }).returning();
    } else {
      [row] = await tx.update(notasTable).set({ contenido: contenido || "", actualizadoEn: new Date() }).returning();
    }
    if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "nota", entidadId: String(row.id), tipo: "guardar", metodo: "PUT", endpoint: "/notas", payload: req.body, origen: "local" });
    await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "nota", recursoId: row.id }).onConflictDoNothing();
    return row;
  });
  res.json({ id: notas.id, contenido: notas.contenido, actualizadoEn: notas.actualizadoEn });
});

export default router;
