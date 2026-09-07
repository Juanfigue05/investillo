import { Router } from "express";
import { db } from "@workspace/db";
import { calculadoraCierreTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res) => {
  const [fila] = await db.select().from(calculadoraCierreTable).where(eq(calculadoraCierreTable.id, 1));
  res.json(fila?.datos ?? {});
});

router.put("/", async (req, res) => {
  const datos = req.body && typeof req.body === "object" ? req.body : {};
  await db.insert(calculadoraCierreTable)
    .values({ id: 1, datos, actualizadoEn: new Date() })
    .onConflictDoUpdate({
      target: calculadoraCierreTable.id,
      set: { datos, actualizadoEn: new Date() },
    });
  res.json({ ok: true });
});

router.delete("/", async (_req, res) => {
  await db.insert(calculadoraCierreTable)
    .values({ id: 1, datos: {}, actualizadoEn: new Date() })
    .onConflictDoUpdate({
      target: calculadoraCierreTable.id,
      set: { datos: {}, actualizadoEn: new Date() },
    });
  res.json({ ok: true });
});

export default router;
