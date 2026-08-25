import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { comprasTable, historialPreciosTable, productosTable } from "@workspace/db/schema";
import { eq,sql } from "drizzle-orm";
import { operacionesSincronizadasTable } from "@workspace/db/schema";

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
  const operationId = req.header("x-operation-id");
  if (operationId) {
    const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
    if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  }
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

  if (operationId) {
    await db.insert(operacionesSincronizadasTable).values({ operationId, tipo: "compra", recursoId: compra.id }).onConflictDoNothing();
  }
  res.status(201).json(mapCompra(compra));
});

router.put("/:id", async (req, res) => {
  const operationId = req.header("x-operation-id");
  if (operationId) {
    const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
    if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  }
  const id = parseInt(req.params.id);
  const {
    estado,
    cantidadRecibida,
    nuevoPrecioCompra,
    nuevoPrecioVentaSinIva,
    tieneIva,
    proveedor,
    actualizarPrecioInventario, // true = update inventory prices
  } = req.body;

  const [existing] = await db.select().from(comprasTable).where(eq(comprasTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Compra no encontrada" });
    return;
  }

  let precioCompraFinal: number | null = null;
  let precioVentaFinal: number | null = null;
  let preciosModificados = false;

  if (estado === "llegado" && cantidadRecibida) {
    const [producto] = await db.select().from(productosTable).where(eq(productosTable.id, existing.productoId));
    if (producto) {
      const cantidadNum = parseFloat(cantidadRecibida);
      const updateProd: Record<string, unknown> = {
        stockActual: sql`${productosTable.stockActual} + ${cantidadNum}`,
        actualizadoEn: new Date(),
      };

      if (nuevoPrecioCompra !== undefined && nuevoPrecioCompra !== "") {
        precioCompraFinal = parseFloat(nuevoPrecioCompra);
        if (Math.abs(precioCompraFinal - toNum(producto.precioCompra)) > 0.01) {
          preciosModificados = true;
        }
        if (actualizarPrecioInventario !== false) {
          updateProd.precioCompra = String(precioCompraFinal);
        }
      } else {
        precioCompraFinal = toNum(producto.precioCompra);
      }

      if (nuevoPrecioVentaSinIva !== undefined && nuevoPrecioVentaSinIva !== "") {
        const pvSinIva = parseFloat(nuevoPrecioVentaSinIva);
        const haIva = tieneIva !== undefined ? Boolean(tieneIva) : producto.tieneIva;
        precioVentaFinal = haIva ? calcPrecioConIva(pvSinIva) : pvSinIva;
        if (Math.abs(precioVentaFinal - toNum(producto.precioVentaConIva)) > 0.01) {
          preciosModificados = true;
        }
        if (actualizarPrecioInventario !== false) {
          updateProd.precioVentaSinIva = String(pvSinIva);
          updateProd.precioVentaConIva = String(precioVentaFinal);
          if (tieneIva !== undefined) updateProd.tieneIva = Boolean(tieneIva);
        }
      } else {
        precioVentaFinal = toNum(producto.precioVentaConIva);
      }

      await db.update(productosTable).set(updateProd).where(eq(productosTable.id, existing.productoId));

      // Always record price history when a product arrives
      const hoy = new Date().toISOString().split("T")[0];
      await db.insert(historialPreciosTable).values({
        productoId: existing.productoId,
        productoNombre: existing.productoNombre,
        productoCodigo: existing.productoCodigo,
        precioCompra: String(precioCompraFinal),
        precioVenta: String(precioVentaFinal),
        fecha: hoy,
        origen: "compra",
        compraId: id,
        proveedor: proveedor || null,
        actualizoPrecioInventario: actualizarPrecioInventario !== false ? "si" : "no",
      });
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

  if (operationId) {
    await db.insert(operacionesSincronizadasTable).values({ operationId, tipo: "compra", recursoId: compra.id }).onConflictDoNothing();
  }
  res.json({ ...mapCompra(compra), preciosModificados });
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(comprasTable).where(eq(comprasTable.id, id));
  res.json({ mensaje: "Compra eliminada" });
});

export default router;
