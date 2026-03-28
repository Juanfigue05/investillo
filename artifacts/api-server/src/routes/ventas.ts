import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ventasDiariasTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

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

router.get("/", async (req, res) => {
  const { fecha } = req.query;
  let query = db.select().from(ventasDiariasTable);
  if (fecha) {
    const ventas = await db.select().from(ventasDiariasTable).where(eq(ventasDiariasTable.fecha, String(fecha)));
    res.json(ventas.map(mapVenta));
    return;
  }
  const ventas = await query.orderBy(ventasDiariasTable.creadoEn);
  res.json(ventas.map(mapVenta));
});

router.post("/", async (req, res) => {
  const { fecha, referencia, tipoLinea, productoId, productoNombre, productoCodigo, productoMarca, cantidad, precioCompraUnidad, precioVentaUnidad, precioVentaTotal, beneficio, descripcion } = req.body;

  const [venta] = await db.insert(ventasDiariasTable).values({
    fecha,
    referencia,
    tipoLinea: tipoLinea || "venta",
    productoId: productoId || null,
    productoNombre: productoNombre || null,
    productoCodigo: productoCodigo || null,
    productoMarca: productoMarca || null,
    cantidad: String(parseFloat(cantidad)),
    precioCompraUnidad: String(parseFloat(precioCompraUnidad || 0)),
    precioVentaUnidad: String(parseFloat(precioVentaUnidad)),
    precioVentaTotal: String(parseFloat(precioVentaTotal)),
    beneficio: String(parseFloat(beneficio || 0)),
    descripcion: descripcion || null,
  }).returning();

  res.status(201).json(mapVenta(venta));
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { fecha, referencia, tipoLinea, productoId, productoNombre, productoCodigo, productoMarca, cantidad, precioCompraUnidad, precioVentaUnidad, precioVentaTotal, beneficio, descripcion } = req.body;

  const [venta] = await db
    .update(ventasDiariasTable)
    .set({
      fecha,
      referencia,
      tipoLinea: tipoLinea || "venta",
      productoId: productoId || null,
      productoNombre: productoNombre || null,
      productoCodigo: productoCodigo || null,
      productoMarca: productoMarca || null,
      cantidad: String(parseFloat(cantidad)),
      precioCompraUnidad: String(parseFloat(precioCompraUnidad || 0)),
      precioVentaUnidad: String(parseFloat(precioVentaUnidad)),
      precioVentaTotal: String(parseFloat(precioVentaTotal)),
      beneficio: String(parseFloat(beneficio || 0)),
      descripcion: descripcion || null,
    })
    .where(eq(ventasDiariasTable.id, id))
    .returning();

  if (!venta) {
    res.status(404).json({ error: "Venta no encontrada" });
    return;
  }
  res.json(mapVenta(venta));
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(ventasDiariasTable).where(eq(ventasDiariasTable.id, id));
  res.json({ mensaje: "Venta eliminada" });
});

export default router;
