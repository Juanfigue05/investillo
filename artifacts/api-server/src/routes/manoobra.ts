import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { manoObraTable, distribucionesTable, trabajadoresTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function toNum(v: unknown): number {
  return typeof v === "string" ? parseFloat(v) : Number(v);
}

async function getManoObraConDistribuciones(manoObraId: number) {
  const [mo] = await db.select().from(manoObraTable).where(eq(manoObraTable.id, manoObraId));
  if (!mo) return null;
  const distribuciones = await db.select().from(distribucionesTable).where(eq(distribucionesTable.manoObraId, manoObraId));
  return {
    id: mo.id,
    fecha: mo.fecha,
    descripcion: mo.descripcion,
    valorTotal: toNum(mo.valorTotal),
    distribuciones: distribuciones.map(d => ({
      id: d.id,
      trabajadorId: d.trabajadorId,
      trabajadorNombre: d.trabajadorNombre,
      valor: toNum(d.valor),
      descuentoSeguro: toNum(d.descuentoSeguro),
      descuentoOtros: toNum(d.descuentoOtros),
    })),
    creadoEn: mo.creadoEn,
  };
}

router.get("/", async (req, res) => {
  const { fecha } = req.query;
  let mos;
  if (fecha) {
    mos = await db.select().from(manoObraTable).where(eq(manoObraTable.fecha, String(fecha)));
  } else {
    mos = await db.select().from(manoObraTable).orderBy(manoObraTable.fecha);
  }

  const results = await Promise.all(mos.map(mo => getManoObraConDistribuciones(mo.id)));
  res.json(results.filter(Boolean));
});

router.post("/", async (req, res) => {
  const { fecha, descripcion, valorTotal, distribuciones } = req.body;

  const [mo] = await db.insert(manoObraTable).values({
    fecha,
    descripcion,
    valorTotal: String(parseFloat(valorTotal)),
  }).returning();

  if (distribuciones && Array.isArray(distribuciones)) {
    for (const dist of distribuciones) {
      await db.insert(distribucionesTable).values({
        manoObraId: mo.id,
        trabajadorId: dist.trabajadorId,
        trabajadorNombre: dist.trabajadorNombre || `Trabajador ${dist.trabajadorId}`,
        valor: String(parseFloat(dist.valor)),
        descuentoSeguro: String(parseFloat(dist.descuentoSeguro || 0)),
        descuentoOtros: String(parseFloat(dist.descuentoOtros || 0)),
      });

      await db
        .update(trabajadoresTable)
        .set({
          totalGanado: db.$count(trabajadoresTable),
        })
        .where(eq(trabajadoresTable.id, dist.trabajadorId));
    }
  }

  const result = await getManoObraConDistribuciones(mo.id);
  res.status(201).json(result);
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { fecha, descripcion, valorTotal, distribuciones } = req.body;

  await db.update(manoObraTable).set({
    fecha,
    descripcion,
    valorTotal: String(parseFloat(valorTotal)),
  }).where(eq(manoObraTable.id, id));

  if (distribuciones && Array.isArray(distribuciones)) {
    await db.delete(distribucionesTable).where(eq(distribucionesTable.manoObraId, id));
    for (const dist of distribuciones) {
      await db.insert(distribucionesTable).values({
        manoObraId: id,
        trabajadorId: dist.trabajadorId,
        trabajadorNombre: dist.trabajadorNombre || `Trabajador ${dist.trabajadorId}`,
        valor: String(parseFloat(dist.valor)),
        descuentoSeguro: String(parseFloat(dist.descuentoSeguro || 0)),
        descuentoOtros: String(parseFloat(dist.descuentoOtros || 0)),
      });
    }
  }

  const result = await getManoObraConDistribuciones(id);
  res.json(result);
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(distribucionesTable).where(eq(distribucionesTable.manoObraId, id));
  await db.delete(manoObraTable).where(eq(manoObraTable.id, id));
  res.json({ mensaje: "Mano de obra eliminada" });
});

export default router;
