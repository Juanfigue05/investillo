import { Router } from "express";
import { db } from "@workspace/db";
import { cierreDiarioTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

// GET /cierre-diario — list all closings sorted by date desc
router.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(cierreDiarioTable)
      .orderBy(desc(cierreDiarioTable.fecha));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /cierre-diario — save or overwrite the closing for today's date
router.post("/", async (req, res) => {
  try {
    const { fecha, datos, totalPagar } = req.body as {
      fecha: string;
      datos: unknown;
      totalPagar: number;
    };
    if (!fecha || !datos) {
      return res.status(400).json({ error: "fecha y datos son requeridos" });
    }
    const existing = await db
      .select()
      .from(cierreDiarioTable)
      .where(eq(cierreDiarioTable.fecha, fecha))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(cierreDiarioTable)
        .set({ datos: datos as any, totalPagar: totalPagar ?? 0 })
        .where(eq(cierreDiarioTable.fecha, fecha))
        .returning();
      return res.json(updated);
    }
    const [created] = await db
      .insert(cierreDiarioTable)
      .values({ fecha, datos: datos as any, totalPagar: totalPagar ?? 0 })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /cierre-diario/:id
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(cierreDiarioTable).where(eq(cierreDiarioTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
