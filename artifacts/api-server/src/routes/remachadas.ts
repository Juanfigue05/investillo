import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { eventosSincronizacionTable, operacionesSincronizadasTable, remachadasTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function toNum(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return isNaN(n) ? 0 : n;
}

router.get("/", async (_req, res) => {
  const rows = await db.select().from(remachadasTable).orderBy(remachadasTable.numeroBanda);
  res.json(rows.map((r) => ({ id: r.id, numeroBanda: r.numeroBanda, valorJuego: toNum(r.valorJuego) })));
});

router.post("/", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  const { numeroBanda, valorJuego } = req.body;
  if (!numeroBanda || !valorJuego) { res.status(400).json({ error: "numeroBanda y valorJuego son requeridos" }); return; }
  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(remachadasTable).values({ numeroBanda: String(numeroBanda), valorJuego: String(parseFloat(valorJuego)) }).returning();
    if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "remachada", entidadId: String(created.id), tipo: "crear", metodo: "POST", endpoint: "/remachadas", payload: req.body, origen: "local" });
    await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "remachada", recursoId: created.id }).onConflictDoNothing();
    return created;
  });
  res.status(201).json({ id: row.id, numeroBanda: row.numeroBanda, valorJuego: toNum(row.valorJuego) });
});

router.put("/:id", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  const id = parseInt(req.params.id);
  const { numeroBanda, valorJuego } = req.body;
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx.update(remachadasTable).set({ numeroBanda: numeroBanda !== undefined ? String(numeroBanda) : undefined, valorJuego: valorJuego !== undefined ? String(parseFloat(valorJuego)) : undefined }).where(eq(remachadasTable.id, id)).returning();
    if (updated && !req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "remachada", entidadId: String(id), tipo: "actualizar", metodo: "PUT", endpoint: `/remachadas/${id}`, payload: req.body, origen: "local" });
    if (updated) await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "remachada", recursoId: id }).onConflictDoNothing();
    return updated;
  });
  if (!row) { res.status(404).json({ error: "No encontrado" }); return; }
  res.json({ id: row.id, numeroBanda: row.numeroBanda, valorJuego: toNum(row.valorJuego) });
});

router.delete("/:id", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = parseInt(req.params.id);
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  await db.transaction(async (tx) => {
    await tx.delete(remachadasTable).where(eq(remachadasTable.id, id));
    if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "remachada", entidadId: String(id), tipo: "eliminar", metodo: "DELETE", endpoint: `/remachadas/${id}`, payload: {}, origen: "local" });
    await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "remachada", recursoId: id }).onConflictDoNothing();
  });
  res.json({ ok: true });
});

export default router;