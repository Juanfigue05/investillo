import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tensionadasTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (_req, res) => {
  const rows = await db.select().from(tensionadasTable).orderBy(desc(tensionadasTable.fecha));
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { fecha, valor } = req.body as { fecha: string; valor: number };
  if (!fecha || !valor) { res.status(400).json({ error: "Fecha y valor son obligatorios" }); return; }
  const [row] = await db.insert(tensionadasTable).values({ fecha, valor: String(valor) }).returning();
  res.json(row);
});

  router.patch("/:id", async (req, res) => {
      const id = Number.parseInt(req.params.id, 10);
    const { fecha, valor } = req.body as { fecha?: string; valor?: number };
      if (!Number.isInteger(id) || id <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || "")) || valor === undefined || !Number.isFinite(Number(valor))) {
      res.status(400).json({ error: "Fecha y valor son obligatorios" });
      return;
    }
      try {
        const [row] = await db.update(tensionadasTable)
          .set({ fecha: String(fecha), valor: String(Number(valor)) })
          .where(eq(tensionadasTable.id, id))
          .returning();
        if (!row) { res.status(404).json({ error: "Tensionada no encontrada" }); return; }
        res.json(row);
      } catch (error) {
        res.status(500).json({ error: `No se pudo guardar la tensionada: ${String(error)}` });
      }
  });

router.delete("/:id", async (req, res) => {
  await db.delete(tensionadasTable).where(eq(tensionadasTable.id, parseInt(req.params.id)));
  res.json({ ok: true });
});

export default router;