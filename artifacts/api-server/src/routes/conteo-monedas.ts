import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { conteoMonedasTable } from "@workspace/db/schema";
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
  const { bolsa, caja } = req.body as { bolsa: number; caja: number };
  await db
    .insert(conteoMonedasTable)
    .values({ id: 1, bolsa: String(toNum(bolsa)), caja: String(toNum(caja)) })
    .onConflictDoUpdate({
      target: conteoMonedasTable.id,
      set: { bolsa: String(toNum(bolsa)), caja: String(toNum(caja)), actualizadoEn: new Date() },
    });
  res.json({ ok: true });
});

export default router;