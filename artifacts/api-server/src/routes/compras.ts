import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { comprasTable, productosTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function toNum(v: unknown): number {
  return typeof v === "string" ? parseFloat(v) : Number(v);
}

function mapCompra(c: typeof comprasTable.$inferSelect) {
  return {
    id: c.id,
    productoId: c.productoId,
    productoNombre: c.productoNombre,
    productoCodigo: c.productoCodigo,
    productoMarca: c.productoMarca,
    stockActual: toNum(c.stockActual),
    stockMinimo: toNum(c.stockMinimo),
    estado: c.estado,
    cantidadRecibida: c.cantidadRecibida ? toNum(c.cantidadRecibida) : null,
    fechaLlegada: c.fechaLlegada || null,
    proveedor: c.proveedor || null,
    precioCompraRegistrado: c.precioCompraRegistrado ? toNum(c.precioCompraRegistrado) : null,
    precioVentaRegistrado: c.precioVentaRegistrado ? toNum(c.precioVentaRegistrado) : null,
    creadoEn: c.creadoEn,
    actualizadoEn: c.actualizadoEn,
  };
}

function calcPrecioConIva(precioSinIva: number): number {
  const conIva = precioSinIva * 1.19;
  return Math.ceil(conIva / 1000) * 1000;
}

router.get("/", async (req, res) => {
  const compras = await db.select().from(comprasTable).orderBy(comprasTable.estado, comprasTable.creadoEn);
  res.json(compras.map(mapCompra));
});

router.post("/", async (req, res) => {
  const { productoId, estado } = req.body;

  const [producto] = await db.select().from(productosTable).where(eq(productosTable.id, parseInt(productoId)));
  if (!producto) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }

  const [compra] = await db.insert(comprasTable).values({
    productoId: producto.id,
    productoNombre: producto.nombre,
    productoCodigo: producto.codigo,
    productoMarca: producto.marca,
    stockActual: String(toNum(producto.stockActual)),
    stockMinimo: String(toNum(producto.stockMinimo)),
    estado: estado || "pendiente",
  }).returning();

  res.status(201).json(mapCompra(compra));
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { estado, cantidadRecibida, nuevoPrecioCompra, nuevoPrecioVentaSinIva, tieneIva, proveedor } = req.body;

  const [existing] = await db.select().from(comprasTable).where(eq(comprasTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Compra no encontrada" });
    return;
  }

  let precioCompraFinal: number | null = null;
  let precioVentaFinal: number | null = null;

  if (estado === "llegado" && cantidadRecibida) {
    const [producto] = await db.select().from(productosTable).where(eq(productosTable.id, existing.productoId));
    if (producto) {
      const newStock = toNum(producto.stockActual) + parseFloat(cantidadRecibida);
      const updateProd: Partial<typeof productosTable.$inferInsert> = {
        stockActual: String(newStock),
        actualizadoEn: new Date(),
      };
      if (nuevoPrecioCompra !== undefined && nuevoPrecioCompra !== "") {
        precioCompraFinal = parseFloat(nuevoPrecioCompra);
        updateProd.precioCompra = String(precioCompraFinal);
      } else {
        precioCompraFinal = toNum(producto.precioCompra);
      }
      if (nuevoPrecioVentaSinIva !== undefined && nuevoPrecioVentaSinIva !== "") {
        const pvSinIva = parseFloat(nuevoPrecioVentaSinIva);
        const haIva = tieneIva !== undefined ? Boolean(tieneIva) : producto.tieneIva;
        precioVentaFinal = haIva ? calcPrecioConIva(pvSinIva) : pvSinIva;
        updateProd.precioVentaSinIva = String(pvSinIva);
        updateProd.precioVentaConIva = String(precioVentaFinal);
        if (tieneIva !== undefined) updateProd.tieneIva = Boolean(tieneIva);
      } else {
        precioVentaFinal = toNum(producto.precioVentaConIva);
      }
      await db.update(productosTable).set(updateProd).where(eq(productosTable.id, existing.productoId));
    }
  }

  const updateData: Partial<typeof comprasTable.$inferInsert> = {
    estado,
    actualizadoEn: new Date(),
  };
  if (cantidadRecibida) updateData.cantidadRecibida = String(parseFloat(cantidadRecibida));
  if (estado === "llegado") updateData.fechaLlegada = new Date().toISOString().split("T")[0];
  if (proveedor !== undefined) updateData.proveedor = proveedor || null;
  if (precioCompraFinal !== null) updateData.precioCompraRegistrado = String(precioCompraFinal);
  if (precioVentaFinal !== null) updateData.precioVentaRegistrado = String(precioVentaFinal);

  const [compra] = await db
    .update(comprasTable)
    .set(updateData)
    .where(eq(comprasTable.id, id))
    .returning();

  res.json(mapCompra(compra));
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(comprasTable).where(eq(comprasTable.id, id));
  res.json({ mensaje: "Compra eliminada" });
});

export default router;
