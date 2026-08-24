import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { productosTable } from "@workspace/db/schema";
import { eq, lte, sql } from "drizzle-orm";

const router: IRouter = Router();

function calcPrecioConIva(precioSinIva: number): number {
  const conIva = precioSinIva * 1.19;
  return Math.ceil(conIva / 1000) * 1000;
}

function toNum(v: unknown): number {
  return typeof v === "string" ? parseFloat(v) : Number(v);
}

function mapProducto(p: typeof productosTable.$inferSelect) {
  return {
    id: p.id,
    nombre: p.nombre,
    codigo: p.codigo,
    marca: p.marca,
    tipo: p.tipo,
    referencia: p.referencia,
    adicional: p.adicional,
    precioCompra: toNum(p.precioCompra),
    precioVentaSinIva: toNum(p.precioVentaSinIva),
    precioVentaConIva: toNum(p.precioVentaConIva),
    tieneIva: p.tieneIva,
    stockActual: toNum(p.stockActual),
    stockMinimo: toNum(p.stockMinimo),
    creadoEn: p.creadoEn,
    actualizadoEn: p.actualizadoEn,
  };
}

router.get("/", async (req, res) => {
  const productos = await db
    .select()
    .from(productosTable)
    .where(eq(productosTable.activo, true))
    .orderBy(productosTable.nombre);
  res.json(productos.map(mapProducto));
});

router.get("/alertas", async (req, res) => {
  const productos = await db
    .select()
    .from(productosTable)
    .where(lte(productosTable.stockActual, sql`${productosTable.stockMinimo} + 1`));
  res.json(productos.map(mapProducto));
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [producto] = await db.select().from(productosTable).where(eq(productosTable.id, id));
  if (!producto) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }
  res.json(mapProducto(producto));
});

router.post("/", async (req, res) => {
  const { nombre, codigo, marca, tipo, referencia, adicional, precioCompra, precioVentaSinIva, tieneIva, stockActual, stockMinimo } = req.body;

  const pvSinIva = parseFloat(precioVentaSinIva);
  const pvConIva = tieneIva ? calcPrecioConIva(pvSinIva) : pvSinIva;

  const [producto] = await db.insert(productosTable).values({
    nombre,
    codigo,
    marca: marca || null,
    tipo: tipo || null,
    referencia: referencia || null,
    adicional: adicional || null,
    precioCompra: String(parseFloat(precioCompra)),
    precioVentaSinIva: String(pvSinIva),
    precioVentaConIva: String(pvConIva),
    tieneIva: Boolean(tieneIva),
    stockActual: String(parseFloat(stockActual)),
    stockMinimo: String(parseFloat(stockMinimo)),
  }).returning();

  res.status(201).json(mapProducto(producto));
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { nombre, codigo, marca, tipo, referencia, adicional, precioCompra, precioVentaSinIva, tieneIva, stockActual, stockMinimo } = req.body;

  const pvSinIva = parseFloat(precioVentaSinIva);
  const pvConIva = tieneIva ? calcPrecioConIva(pvSinIva) : pvSinIva;

  const [producto] = await db
    .update(productosTable)
    .set({
      nombre,
      codigo,
      marca: marca || null,
      tipo: tipo || null,
      referencia: referencia || null,
      adicional: adicional || null,
      precioCompra: String(parseFloat(precioCompra)),
      precioVentaSinIva: String(pvSinIva),
      precioVentaConIva: String(pvConIva),
      tieneIva: Boolean(tieneIva),
      stockActual: String(parseFloat(stockActual)),
      stockMinimo: String(parseFloat(stockMinimo)),
      actualizadoEn: new Date(),
    })
    .where(eq(productosTable.id, id))
    .returning();

  if (!producto) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }
  res.json(mapProducto(producto));
});

router.put("/:id/stock", async (req, res) => {
  const id = parseInt(req.params.id);
  const { cantidad, precioCompra, precioVentaSinIva, tieneIva } = req.body;

  const [existing] = await db.select().from(productosTable).where(eq(productosTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }

  const newStock = toNum(existing.stockActual) + parseFloat(cantidad);
  const updateData: Partial<typeof productosTable.$inferInsert> = {
    stockActual: String(newStock),
    actualizadoEn: new Date(),
  };

  if (precioCompra !== undefined) updateData.precioCompra = String(parseFloat(precioCompra));
  if (precioVentaSinIva !== undefined) {
    const pvSinIva = parseFloat(precioVentaSinIva);
    const haIva = tieneIva !== undefined ? Boolean(tieneIva) : existing.tieneIva;
    updateData.precioVentaSinIva = String(pvSinIva);
    updateData.precioVentaConIva = String(haIva ? calcPrecioConIva(pvSinIva) : pvSinIva);
    if (tieneIva !== undefined) updateData.tieneIva = Boolean(tieneIva);
  }

  const [producto] = await db.update(productosTable).set(updateData).where(eq(productosTable.id, id)).returning();
  res.json(mapProducto(producto));
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.update(productosTable).set({ activo: false }).where(eq(productosTable.id, id));
  res.json({ mensaje: "Producto marcado como inactivo" });
});

export default router;
