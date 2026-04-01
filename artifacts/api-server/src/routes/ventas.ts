import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ventasDiariasTable, productosTable } from "@workspace/db/schema";
import { eq, sql, and, gte, lte } from "drizzle-orm";

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

router.get("/resumen", async (req, res) => {
  const { desde, hasta } = req.query;
  if (!desde || !hasta) {
    res.status(400).json({ error: "Parámetros desde y hasta requeridos" });
    return;
  }

  const ventas = await db.select().from(ventasDiariasTable)
    .where(sql`${ventasDiariasTable.fecha} >= ${String(desde)} AND ${ventasDiariasTable.fecha} <= ${String(hasta)}`);

  // Aggregate by date
  const byDate = new Map<string, { totalVentas: number; totalManoObra: number; cantidadVentas: number }>();

  for (const v of ventas) {
    const fecha = String(v.fecha);
    if (!byDate.has(fecha)) {
      byDate.set(fecha, { totalVentas: 0, totalManoObra: 0, cantidadVentas: 0 });
    }
    const day = byDate.get(fecha)!;
    if (v.tipoLinea === "venta") {
      day.totalVentas += toNum(v.precioVentaTotal);
      day.cantidadVentas += 1;
    } else if (v.tipoLinea === "manoobra") {
      day.totalManoObra += toNum(v.precioVentaTotal);
    }
  }

  const result = Array.from(byDate.entries())
    .map(([fecha, data]) => ({ fecha, ...data }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  res.json(result);
});

router.get("/", async (req, res) => {
  const { fecha } = req.query;
  if (fecha) {
    const ventas = await db.select().from(ventasDiariasTable).where(eq(ventasDiariasTable.fecha, String(fecha))).orderBy(ventasDiariasTable.creadoEn);
    res.json(ventas.map(mapVenta));
    return;
  }
  const ventas = await db.select().from(ventasDiariasTable).orderBy(ventasDiariasTable.creadoEn);
  res.json(ventas.map(mapVenta));
});

router.post("/", async (req, res) => {
  const { fecha, referencia, tipoLinea, productoId, productoNombre, productoCodigo, productoMarca, cantidad, precioCompraUnidad, precioVentaUnidad, precioVentaTotal, beneficio, descripcion } = req.body;

  const cantidadNum = parseFloat(cantidad);

  const [venta] = await db.insert(ventasDiariasTable).values({
    fecha,
    referencia,
    tipoLinea: tipoLinea || "venta",
    productoId: productoId || null,
    productoNombre: productoNombre || null,
    productoCodigo: productoCodigo || null,
    productoMarca: productoMarca || null,
    cantidad: String(cantidadNum),
    precioCompraUnidad: String(parseFloat(precioCompraUnidad || 0)),
    precioVentaUnidad: String(parseFloat(precioVentaUnidad)),
    precioVentaTotal: String(parseFloat(precioVentaTotal)),
    beneficio: String(parseFloat(beneficio || 0)),
    descripcion: descripcion || null,
  }).returning();

  // Reducir inventario al registrar una venta normal
  if ((tipoLinea === "venta" || !tipoLinea) && productoId) {
    const [prod] = await db.select().from(productosTable).where(eq(productosTable.id, parseInt(productoId)));
    if (prod) {
      const nuevoStock = Math.max(0, toNum(prod.stockActual) - cantidadNum);
      await db.update(productosTable)
        .set({ stockActual: String(nuevoStock), actualizadoEn: new Date() })
        .where(eq(productosTable.id, parseInt(productoId)));
    }
  }

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

  // Restore stock if it was a normal sale with product
  const [venta] = await db.select().from(ventasDiariasTable).where(eq(ventasDiariasTable.id, id));
  if (venta && (venta.tipoLinea === "venta" || !venta.tipoLinea) && venta.productoId) {
    const [prod] = await db.select().from(productosTable).where(eq(productosTable.id, venta.productoId));
    if (prod) {
      const nuevoStock = toNum(prod.stockActual) + toNum(venta.cantidad);
      await db.update(productosTable)
        .set({ stockActual: String(nuevoStock), actualizadoEn: new Date() })
        .where(eq(productosTable.id, venta.productoId));
    }
  }

  await db.delete(ventasDiariasTable).where(eq(ventasDiariasTable.id, id));
  res.json({ mensaje: "Venta eliminada" });
});

export default router;
