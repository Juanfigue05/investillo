import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { conteoMonedasTable, eventosSincronizacionTable, operacionesSincronizadasTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function toNum(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return isNaN(n) ? 0 : n;
}

router.get("/", async (_req, res) => {
  const [row] = await db.select().from(conteoMonedasTable).where(eq(conteoMonedasTable.id, 1));
  res.json({ bolsa: toNum(row?.bolsa), caja: toNum(row?.caja) });
});

router.put("/", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  const { bolsa, caja } = req.body as { bolsa: number; caja: number };
  await db.transaction(async (tx) => {
    await tx.insert(conteoMonedasTable).values({ id: 1, bolsa: String(toNum(bolsa)), caja: String(toNum(caja)) }).onConflictDoUpdate({
      target: conteoMonedasTable.id,
      set: { bolsa: String(toNum(bolsa)), caja: String(toNum(caja)), actualizadoEn: new Date() },
    });
    if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "conteo_monedas", entidadId: "1", tipo: "guardar", metodo: "PUT", endpoint: "/conteo-monedas", payload: req.body, origen: "local" });
    await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "conteo_monedas", recursoId: 1 }).onConflictDoNothing();
  });
  res.json({ ok: true });
});

export default router;