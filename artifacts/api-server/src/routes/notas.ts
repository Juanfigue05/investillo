import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { notasTable } from "@workspace/db/schema";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  let [notas] = await db.select().from(notasTable);
  if (!notas) {
    [notas] = await db.insert(notasTable).values({ contenido: "" }).returning();
  }
  res.json({ id: notas.id, contenido: notas.contenido, actualizadoEn: notas.actualizadoEn });
});

router.put("/", async (req, res) => {
  const { contenido } = req.body;
  let [notas] = await db.select().from(notasTable);

  if (!notas) {
    [notas] = await db.insert(notasTable).values({ contenido: contenido || "" }).returning();
  } else {
    [notas] = await db.update(notasTable).set({ contenido: contenido || "", actualizadoEn: new Date() }).returning();
  }
  res.json({ id: notas.id, contenido: notas.contenido, actualizadoEn: notas.actualizadoEn });
});

export default router;
