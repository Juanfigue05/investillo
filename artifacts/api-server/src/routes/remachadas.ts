import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { remachadasTable } from "@workspace/db/schema";
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
  const { numeroBanda, valorJuego } = req.body;
  if (!numeroBanda || !valorJuego) { res.status(400).json({ error: "numeroBanda y valorJuego son requeridos" }); return; }
  const [row] = await db.insert(remachadasTable).values({ numeroBanda: String(numeroBanda), valorJuego: String(parseFloat(valorJuego)) }).returning();
  res.status(201).json({ id: row.id, numeroBanda: row.numeroBanda, valorJuego: toNum(row.valorJuego) });
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { numeroBanda, valorJuego } = req.body;
  const [row] = await db.update(remachadasTable)
    .set({ numeroBanda: numeroBanda !== undefined ? String(numeroBanda) : undefined, valorJuego: valorJuego !== undefined ? String(parseFloat(valorJuego)) : undefined })
    .where(eq(remachadasTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "No encontrado" }); return; }
  res.json({ id: row.id, numeroBanda: row.numeroBanda, valorJuego: toNum(row.valorJuego) });
});

router.delete("/:id", async (req, res) => {
  await db.delete(remachadasTable).where(eq(remachadasTable.id, parseInt(req.params.id)));
  res.json({ ok: true });
});

export default router;