import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { comprasTable, eventosSincronizacionTable, historialPreciosTable, productosTable } from "@workspace/db/schema";
import { eq,sql,and, gte } from "drizzle-orm";
import { operacionesSincronizadasTable } from "@workspace/db/schema";
import { fechaHoyColombia, fechaColombia } from "../lib/fecha";
import { parseNumeroColombia } from "@workspace/api-zod";

const router: IRouter = Router();

function toNum(v: unknown): number {
  return typeof v === "string" ? Number(v) : Number(v);
}

function mapCompra(
  c: typeof comprasTable.$inferSelect,
  precioVentaSinIva?: unknown,
) {
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
    precioVentaRegistrado:
      precioVentaSinIva != null
        ? toNum(precioVentaSinIva)
        : c.precioVentaRegistrado
          ? toNum(c.precioVentaRegistrado)
          : null,
    creadoEn: c.creadoEn,
    actualizadoEn: c.actualizadoEn,
  };
}

function calcPrecioConIva(precioSinIva: number): number {
  const conIva = precioSinIva * 1.19;
  return Math.ceil(conIva / 1000) * 1000;
}

router.get("/", async (req, res) => {
  const compras = await db
    .select({
      compra: comprasTable,
      precioVentaSinIva: productosTable.precioVentaSinIva,
    })
    .from(comprasTable)
    .leftJoin(productosTable, eq(comprasTable.productoId, productosTable.id))
    .orderBy(comprasTable.estado, comprasTable.creadoEn);
  res.json(compras.map(({ compra, precioVentaSinIva }) => mapCompra(compra, precioVentaSinIva)));
});

router.post("/", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
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

  const compra = await db.transaction(async (tx) => {
    const [created] = await tx.insert(comprasTable).values({
      productoId: producto.id,
      productoNombre: producto.nombre,
      productoCodigo: producto.codigo,
      productoMarca: producto.marca,
      stockActual: String(toNum(producto.stockActual)),
      stockMinimo: String(toNum(producto.stockMinimo)),
      estado: estado || "pendiente",
    }).returning();
    if (!req.header("x-sync-apply")) {
      await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "compra", entidadId: String(created.id), tipo: "crear", metodo: "POST", endpoint: "/compras", payload: req.body, origen: "local" });
    }
    await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "compra", recursoId: created.id }).onConflictDoNothing();
    return created;
  });
  res.status(201).json(mapCompra(compra));
});

interface LlegadaInput {
  cantidadRecibida?: string | number;
  cantidadLocal?: string | number;
  cantidadBodega?: string | number;
  nuevoPrecioCompra?: string | number;
  nuevoPrecioVentaSinIva?: string | number;
  tieneIva?: boolean;
  proveedor?: string;
  actualizarPrecioInventario?: boolean;
  estado?: string;
  fechaLlegada?: string;
}

async function procesarLlegadaCompra(id: number, datos: LlegadaInput) {
  const { estado, cantidadRecibida, cantidadLocal, cantidadBodega, nuevoPrecioCompra, nuevoPrecioVentaSinIva, tieneIva, proveedor, actualizarPrecioInventario, fechaLlegada } = datos;

  const [existing] = await db.select().from(comprasTable).where(eq(comprasTable.id, id));
  if (!existing) throw new Error(`Compra ${id} no encontrada`);

  let precioCompraFinal: number | null = null;
  let precioVentaFinal: number | null = null;
  let precioVentaSinIvaRegistrado: number | null = null;
  let preciosModificados = false;

  if (estado === "llegado" && cantidadRecibida) {
    const [producto] = await db.select().from(productosTable).where(eq(productosTable.id, existing.productoId));
    if (producto) {
      const cantidadNum = parseNumeroColombia(cantidadRecibida);
      const updateProd: Record<string, unknown> = {
        stockActual: sql`${productosTable.stockActual} + ${cantidadNum}`,
        stockLocal: sql`${productosTable.stockLocal} + ${parseNumeroColombia(cantidadLocal || 0)}`,
        stockBodega: sql`${productosTable.stockBodega} + ${parseNumeroColombia(cantidadBodega || 0)}`,
        actualizadoEn: new Date(),
      };

      if (nuevoPrecioCompra !== undefined && nuevoPrecioCompra !== "") {
        precioCompraFinal = parseNumeroColombia(nuevoPrecioCompra);
        if (Math.abs(precioCompraFinal! - toNum(producto.precioCompra)) > 0.01) preciosModificados = true;
        if (actualizarPrecioInventario !== false) updateProd.precioCompra = String(precioCompraFinal);
      } else {
        precioCompraFinal = toNum(producto.precioCompra);
      }

      if (nuevoPrecioVentaSinIva !== undefined && nuevoPrecioVentaSinIva !== "") {
        const pvSinIva = parseNumeroColombia(nuevoPrecioVentaSinIva);
        precioVentaSinIvaRegistrado = pvSinIva;
        precioVentaFinal = calcPrecioConIva(pvSinIva);
        if (Math.abs(precioVentaFinal - toNum(producto.precioVentaConIva)) > 0.01) preciosModificados = true;
        if (actualizarPrecioInventario !== false) {
          updateProd.precioVentaSinIva = String(pvSinIva);
          updateProd.precioVentaConIva = String(precioVentaFinal);
          if (tieneIva !== undefined) updateProd.tieneIva = Boolean(tieneIva);
        }
      } else {
        precioVentaFinal = toNum(producto.precioVentaConIva);
        precioVentaSinIvaRegistrado = toNum(producto.precioVentaSinIva);
      }

      await db.update(productosTable).set(updateProd).where(eq(productosTable.id, existing.productoId));

      const hoy = fechaHoyColombia();
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

  const updateData: Partial<typeof comprasTable.$inferInsert> = { estado, actualizadoEn: new Date() };
  if (cantidadRecibida) updateData.cantidadRecibida = String(parseNumeroColombia(cantidadRecibida));
  if (estado === "llegado") updateData.fechaLlegada = fechaLlegada || fechaHoyColombia();
  if (proveedor !== undefined) updateData.proveedor = proveedor || null;
  if (precioCompraFinal !== null) updateData.precioCompraRegistrado = String(precioCompraFinal);
  if (precioVentaFinal !== null) {
    // Compras muestra y conserva el precio de venta sin IVA.
    updateData.precioVentaRegistrado = String(precioVentaSinIvaRegistrado ?? precioVentaFinal);
  }

  const [compra] = await db.update(comprasTable).set(updateData).where(eq(comprasTable.id, id)).returning();
  return { compra, preciosModificados };
}

router.put("/:id", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  if (operationId) {
    const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
    if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  }
  const id = parseInt(req.params.id);

  try {
    const { compra, preciosModificados } = await procesarLlegadaCompra(id, req.body);
    if (!req.header("x-sync-apply")) {
      await db.insert(eventosSincronizacionTable).values({ operationId, entidad: "compra", entidadId: String(compra.id), tipo: "llegada", metodo: "PUT", endpoint: `/compras/${id}`, payload: req.body, origen: "local" });
    }
    await db.insert(operacionesSincronizadasTable).values({ operationId, tipo: "compra", recursoId: compra.id }).onConflictDoNothing();
    res.json({ ...mapCompra(compra), preciosModificados });
  } catch (err) {
    res.status(404).json({ error: String(err) });
  }
});

router.post("/lote-llegada", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  const { proveedor, fechaLlegada, items } = req.body as { proveedor: string; fechaLlegada?: string; items: Array<{ id: number; cantidadRecibida: number; cantidadLocal?: number; cantidadBodega?: number; nuevoPrecioCompra: number; nuevoPrecioVentaSinIva: number; tieneIva: boolean; actualizarPrecioInventario: boolean }> };

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "Selecciona al menos un producto" });
    return;
  }

  for (const item of items) {
    const recibida = toNum(item.cantidadRecibida);
    const distribuida = toNum(item.cantidadLocal) + toNum(item.cantidadBodega);
    if (Math.abs(recibida - distribuida) > 0.001) {
      res.status(400).json({ error: `La cantidad de Local + Bodega debe coincidir con la recibida en el producto ${item.id}.` });
      return;
    }
  }
  
  const resultados = [];
  for (const item of items) {
    const { compra, preciosModificados } = await procesarLlegadaCompra(item.id, {
      estado: "llegado",
      cantidadRecibida: item.cantidadRecibida,
      cantidadLocal: item.cantidadLocal,
      cantidadBodega: item.cantidadBodega,
      nuevoPrecioCompra: item.nuevoPrecioCompra,
      nuevoPrecioVentaSinIva: item.nuevoPrecioVentaSinIva,
      tieneIva: item.tieneIva,
      proveedor,
      fechaLlegada,
      actualizarPrecioInventario: item.actualizarPrecioInventario,
    });
    resultados.push({ ...mapCompra(compra), preciosModificados });
  }

  if (!req.header("x-sync-apply")) await db.insert(eventosSincronizacionTable).values({ operationId, entidad: "compra_lote", entidadId: operationId, tipo: "lote_llegada", metodo: "POST", endpoint: "/compras/lote-llegada", payload: req.body, origen: "local" });
  await db.insert(operacionesSincronizadasTable).values({ operationId, tipo: "compra_lote", recursoId: null }).onConflictDoNothing();

  res.json({ ok: true, procesados: resultados.length, resultados });
});

router.delete("/:id", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = parseInt(req.params.id);
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }

  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(comprasTable).where(eq(comprasTable.id, id));
      if (existing && existing.estado === "llegado" && existing.cantidadRecibida) {
        await tx.update(productosTable)
          .set({ stockActual: sql`GREATEST(0, ${productosTable.stockActual} - ${toNum(existing.cantidadRecibida)})`, actualizadoEn: new Date() })
          .where(eq(productosTable.id, existing.productoId));
      }
      await tx.delete(comprasTable).where(eq(comprasTable.id, id));
      if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "compra", entidadId: String(id), tipo: "eliminar", metodo: "DELETE", endpoint: `/compras/${id}`, payload: {}, origen: "local" });
      await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "compra", recursoId: id }).onConflictDoNothing();
    });
    res.json({ mensaje: "Compra eliminada y stock revertido" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.patch("/:id/corregir", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = parseInt(req.params.id);
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  const { cantidadRecibida, precioCompraRegistrado, precioVentaRegistrado } = req.body;

  try {
    const resultado = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(comprasTable).where(eq(comprasTable.id, id));
      if (!existing) throw new Error("Compra no encontrada");

      const cantidadNueva = parseFloat(String(cantidadRecibida));
      const cantidadVieja = toNum(existing.cantidadRecibida);
      const delta = cantidadNueva - cantidadVieja;

      if (delta !== 0) {
        await tx.update(productosTable)
          .set({ stockActual: sql`GREATEST(0, ${productosTable.stockActual} + ${delta})`, actualizadoEn: new Date() })
          .where(eq(productosTable.id, existing.productoId));
      }

      const [actualizada] = await tx.update(comprasTable)
        .set({
          cantidadRecibida: String(cantidadNueva),
          precioCompraRegistrado: precioCompraRegistrado !== undefined ? String(parseFloat(precioCompraRegistrado)) : existing.precioCompraRegistrado,
          precioVentaRegistrado: precioVentaRegistrado !== undefined ? String(parseFloat(precioVentaRegistrado)) : existing.precioVentaRegistrado,
          actualizadoEn: new Date(),
        })
        .where(eq(comprasTable.id, id))
        .returning();

      return actualizada;
    });

    if (!req.header("x-sync-apply")) await db.insert(eventosSincronizacionTable).values({ operationId, entidad: "compra", entidadId: String(id), tipo: "corregir", metodo: "PATCH", endpoint: `/compras/${id}/corregir`, payload: req.body, origen: "local" });
    await db.insert(operacionesSincronizadasTable).values({ operationId, tipo: "compra", recursoId: id }).onConflictDoNothing();

    res.json(mapCompra(resultado));
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

router.get("/resumen-mensual", async (_req, res) => {
  const seisAtras = new Date();
  seisAtras.setMonth(seisAtras.getMonth() - 6);
  const fechaLimite = fechaColombia(seisAtras);

  const llegadas = await db
    .select()
    .from(comprasTable)
    .where(and(eq(comprasTable.estado, "llegado"), gte(comprasTable.fechaLlegada, fechaLimite)));

  // Total por día
  const totalPorDia = new Map<string, number>();
  for (const c of llegadas) {
    if (!c.fechaLlegada) continue;
    const total = toNum(c.cantidadRecibida) * toNum(c.precioCompraRegistrado);
    totalPorDia.set(c.fechaLlegada, (totalPorDia.get(c.fechaLlegada) || 0) + total);
  }

  // Promedio de esos totales diarios, agrupado por mes
  const diasPorMes = new Map<string, number[]>();
  for (const [fecha, total] of totalPorDia) {
    const mes = fecha.slice(0, 7); // "2026-03"
    if (!diasPorMes.has(mes)) diasPorMes.set(mes, []);
    diasPorMes.get(mes)!.push(total);
  }

  const resultado = [...diasPorMes.entries()]
    .map(([mes, totales]) => ({
      mes,
      promedioDiario: Math.round(totales.reduce((s, t) => s + t, 0) / totales.length),
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  res.json(resultado);
});

export default router;
