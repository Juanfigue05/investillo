import { Router } from "express";
import { db } from "@workspace/db";
import { eventosSincronizacionTable } from "@workspace/db/schema";
import { and, asc, gt, eq } from "drizzle-orm";

const router = Router();

router.get("/pull", async (req, res) => {
  const desde = new Date(String(req.query.desde || "1970-01-01T00:00:00.000Z"));
  if (Number.isNaN(desde.getTime())) { res.status(400).json({ error: "desde inválido" }); return; }
  const eventos = await db.select({
    operationId: eventosSincronizacionTable.operationId,
    endpoint: eventosSincronizacionTable.endpoint,
    metodo: eventosSincronizacionTable.metodo,
    payload: eventosSincronizacionTable.payload,
    creadoEn: eventosSincronizacionTable.creadoEn,
  }).from(eventosSincronizacionTable)
    .where(and(eq(eventosSincronizacionTable.origen, "remoto"), gt(eventosSincronizacionTable.creadoEn, desde)))
    .orderBy(asc(eventosSincronizacionTable.creadoEn))
    .limit(100);
  const hasta = eventos.at(-1)?.creadoEn ?? desde;
  res.json({ eventos, hasta });
});

export default router;