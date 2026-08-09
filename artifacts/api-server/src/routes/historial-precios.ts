import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { historialPreciosTable } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";

const router: IRouter = Router();

function toNum(v: unknown): number {
  return typeof v === "string" ? parseFloat(v) : Number(v);
}

function mapHistorial(h: typeof historialPreciosTable.$inferSelect) {
  return {
    id: h.id,
    productoId: h.productoId,
    productoNombre: h.productoNombre,
    productoCodigo: h.productoCodigo,
    precioCompra: toNum(h.precioCompra),
    precioVenta: toNum(h.precioVenta),
    fecha: h.fecha,
    origen: h.origen,
    compraId: h.compraId,
    proveedor: h.proveedor,
    actualizoPrecioInventario: h.actualizoPrecioInventario,
    creadoEn: h.creadoEn,
  };
}

router.get("/", async (req, res) => {
  const productoId = req.query.productoId ? parseInt(req.query.productoId as string) : undefined;
  const registros = productoId
    ? await db.select().from(historialPreciosTable).where(eq(historialPreciosTable.productoId, productoId)).orderBy(desc(historialPreciosTable.fecha))
    : await db.select().from(historialPreciosTable).orderBy(desc(historialPreciosTable.fecha));
  res.json(registros.map(mapHistorial));
});

export default router;
