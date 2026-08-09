import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { historialDiasTable, ventasDiariasTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function toNum(v: unknown): number {
  return typeof v === "string" ? parseFloat(v) : Number(v);
}

function mapVenta(v: typeof ventasDiariasTable.$inferSelect) {
  return {
    id: v.id,
    fecha: v.fecha,
    referencia: v.referencia,
    tipoLinea: v.tipoLinea,
    productoId: v.productoId,
    productoNombre: v.productoNombre,
    productoCodigo: v.productoCodigo,
    productoMarca: v.productoMarca,
    cantidad: toNum(v.cantidad),
    precioCompraUnidad: toNum(v.precioCompraUnidad),
    precioVentaUnidad: toNum(v.precioVentaUnidad),
    precioVentaTotal: toNum(v.precioVentaTotal),
    beneficio: toNum(v.beneficio),
    descripcion: v.descripcion,
    creadoEn: v.creadoEn,
  };
}

async function mapHistorial(dia: typeof historialDiasTable.$inferSelect) {
  const ventas = await db
    .select()
    .from(ventasDiariasTable)
    .where(eq(ventasDiariasTable.fecha, dia.fecha))
    .orderBy(ventasDiariasTable.creadoEn);
  return {
    id: dia.id,
    fecha: dia.fecha,
    notas: dia.notas,
    guardadoEn: dia.guardadoEn,
    ventas: ventas.map(mapVenta),
  };
}

// GET /historial — all saved days newest first
router.get("/", async (_req, res) => {
  const dias = await db
    .select()
    .from(historialDiasTable)
    .orderBy(historialDiasTable.fecha);
  const result = await Promise.all(dias.map(mapHistorial));
  res.json(result.reverse());
});

// POST /historial — save a day (fecha must be unique)
router.post("/", async (req, res) => {
  const { fecha, notas } = req.body as { fecha: string; notas?: string };
  if (!fecha) {
    res.status(400).json({ error: "La fecha es obligatoria" });
    return;
  }
  try {
    const [dia] = await db
      .insert(historialDiasTable)
      .values({ fecha, notas: notas || null })
      .returning();
    res.status(201).json(await mapHistorial(dia));
  } catch {
    // Unique constraint violation = already saved
    const existing = await db
      .select()
      .from(historialDiasTable)
      .where(eq(historialDiasTable.fecha, fecha));
    if (existing.length) {
      res.status(409).json({ error: "Este día ya está guardado en el historial", id: existing[0].id });
    } else {
      res.status(500).json({ error: "Error al guardar el día" });
    }
  }
});

// PUT /historial/:id — update notas only, fecha is immutable
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { notas } = req.body as { notas?: string | null };
  const [dia] = await db
    .update(historialDiasTable)
    .set({ notas: notas ?? null })
    .where(eq(historialDiasTable.id, id))
    .returning();
  if (!dia) {
    res.status(404).json({ error: "Día no encontrado" });
    return;
  }
  res.json(await mapHistorial(dia));
});

// DELETE /historial/:id — remove from historial only, ventas stay
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(historialDiasTable).where(eq(historialDiasTable.id, id));
  res.json({ mensaje: "Eliminado del historial" });
});

export default router;
