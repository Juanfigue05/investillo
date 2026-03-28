import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { trabajadoresTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function toNum(v: unknown): number {
  return typeof v === "string" ? parseFloat(v) : Number(v);
}

function mapTrabajador(t: typeof trabajadoresTable.$inferSelect) {
  return {
    id: t.id,
    nombre: t.nombre,
    descuentoSeguro: toNum(t.descuentoSeguro),
    descuentoOtros: toNum(t.descuentoOtros),
    totalGanado: toNum(t.totalGanado),
    totalDescuentos: toNum(t.totalDescuentos),
    activo: t.activo,
    creadoEn: t.creadoEn,
  };
}

router.get("/", async (req, res) => {
  const trabajadores = await db.select().from(trabajadoresTable).orderBy(trabajadoresTable.id);
  res.json(trabajadores.map(mapTrabajador));
});

router.post("/", async (req, res) => {
  const { nombre, descuentoSeguro, descuentoOtros, activo } = req.body;

  const [trabajador] = await db.insert(trabajadoresTable).values({
    nombre,
    descuentoSeguro: String(parseFloat(descuentoSeguro || 0)),
    descuentoOtros: String(parseFloat(descuentoOtros || 0)),
    activo: activo !== undefined ? Boolean(activo) : true,
  }).returning();

  res.status(201).json(mapTrabajador(trabajador));
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { nombre, descuentoSeguro, descuentoOtros, activo } = req.body;

  const [trabajador] = await db
    .update(trabajadoresTable)
    .set({
      nombre,
      descuentoSeguro: descuentoSeguro !== undefined ? String(parseFloat(descuentoSeguro)) : undefined,
      descuentoOtros: descuentoOtros !== undefined ? String(parseFloat(descuentoOtros)) : undefined,
      activo: activo !== undefined ? Boolean(activo) : undefined,
    })
    .where(eq(trabajadoresTable.id, id))
    .returning();

  if (!trabajador) {
    res.status(404).json({ error: "Trabajador no encontrado" });
    return;
  }
  res.json(mapTrabajador(trabajador));
});

export default router;
