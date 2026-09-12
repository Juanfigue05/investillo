import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { eventosSincronizacionTable, ventasDiariasTable, productosTable } from "@workspace/db/schema";
import { eq, sql, and, gte, lte } from "drizzle-orm";
import { manoObraTable, distribucionesTable, trabajadoresTable, operacionesSincronizadasTable } from "@workspace/db/schema";

const router: IRouter = Router();

function toNum(v: unknown): number {
  return typeof v === "string" ? parseFloat(v) : Number(v);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function ajustarStockVenta(tx: Tx, productoId: number, delta: number) {
  if (!Number.isFinite(delta) || delta === 0) return;
  const [producto] = await tx.select().from(productosTable).where(eq(productosTable.id, productoId));
  if (!producto) throw new Error("Producto no encontrado");

  const actual = toNum(producto.stockActual);
  const localRegistrado = toNum(producto.stockLocal);
  const bodegaRegistrada = toNum(producto.stockBodega);
  const local = localRegistrado + bodegaRegistrada === 0 && actual > 0 ? actual : localRegistrado;
  const bodega = bodegaRegistrada;

  if (delta > 0 && local + bodega + 0.0001 < delta) {
    throw new Error(`No hay existencias suficientes para ${producto.nombre}`);
  }

  if (delta > 0) {
    const desdeLocal = Math.min(local, delta);
    const desdeBodega = delta - desdeLocal;
    await tx.update(productosTable).set({
      stockLocal: String(local - desdeLocal),
      stockBodega: String(bodega - desdeBodega),
      stockActual: String(actual - delta),
      actualizadoEn: new Date(),
    }).where(eq(productosTable.id, productoId));
    return;
  }

  await tx.update(productosTable).set({
    stockLocal: String(local - delta),
    stockBodega: String(bodega),
    stockActual: String(actual - delta),
    actualizadoEn: new Date(),
  }).where(eq(productosTable.id, productoId));
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
    origen: v.origen,
    afectaInventario: v.afectaInventario,
    descripcion: v.descripcion,
    formaPago: v.formaPago,
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
    const ventas = await db.select().from(ventasDiariasTable).where(eq(ventasDiariasTable.fecha, String(fecha)));
    const ordenadas = [...ventas].sort((a, b) => {
      if (a.orden != null || b.orden != null) {
        if (a.orden == null) return 1;
        if (b.orden == null) return -1;
        if (a.orden !== b.orden) return a.orden - b.orden;
      }
      const aCreado = a.creadoEn ? new Date(a.creadoEn).getTime() : 0;
      const bCreado = b.creadoEn ? new Date(b.creadoEn).getTime() : 0;
      if (aCreado !== bCreado) return aCreado - bCreado;
      return Number(a.id) - Number(b.id);
    });
    res.json(ordenadas.map(mapVenta));
    return;
  }
  const ventas = await db.select().from(ventasDiariasTable);
  const ordenadas = [...ventas].sort((a, b) => {
    if (a.orden != null || b.orden != null) {
      if (a.orden == null) return 1;
      if (b.orden == null) return -1;
      if (a.orden !== b.orden) return a.orden - b.orden;
    }
    const aCreado = a.creadoEn ? new Date(a.creadoEn).getTime() : 0;
    const bCreado = b.creadoEn ? new Date(b.creadoEn).getTime() : 0;
    if (aCreado !== bCreado) return aCreado - bCreado;
    return Number(a.id) - Number(b.id);
  });
  res.json(ordenadas.map(mapVenta));
});

router.post("/", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();

  if (operationId) {
    const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
    if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  }

  const {
    fecha, referencia, tipoLinea, productoId,
    productoNombre, productoCodigo, productoMarca,
    cantidad, precioCompraUnidad, precioVentaUnidad,
    precioVentaTotal, beneficio, descripcion, formaPago, origen, afectaInventario,
  } = req.body;
  const esPagoCreditoAntiguo = origen === "pago_credito_antiguo";
  const afectaInventarioReal = !esPagoCreditoAntiguo && afectaInventario !== false;
  const cantidadNum = parseFloat(String(cantidad));
  if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
    res.status(400).json({ error: "La cantidad debe ser mayor que cero" });
    return;
  }

  try {
    const venta = await db.transaction(async (tx) => {
      const [creada] = await tx.insert(ventasDiariasTable).values({
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
        formaPago: formaPago || null,
        origen: origen || "venta_normal",
        afectaInventario: afectaInventarioReal,
      }).returning();

      const esVentaConProducto = (tipoLinea === "venta" || !tipoLinea) && productoId && afectaInventarioReal;
      if (esVentaConProducto) {
        await ajustarStockVenta(tx, Number(productoId), cantidadNum);
      }

      if (!req.header("x-sync-apply")) {
        await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "venta", entidadId: String(creada.id), tipo: "crear", metodo: "POST", endpoint: "/ventas", payload: req.body, origen: "local" });
      }
      await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "venta", recursoId: creada.id }).onConflictDoNothing();

      return creada;
    });

    res.status(201).json(mapVenta(venta));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/lote-pago-antiguo", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const { items } = req.body as { items?: Array<Record<string, unknown>> };
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "El lote debe contener al menos una fila" });
    return;
  }
  try {
    const creadas = await db.transaction(async (tx) => {
      const valores = items.map((item) => ({
        fecha: String(item.fecha), referencia: String(item.referencia || ""), tipoLinea: item.tipoLinea === "manoobra" ? "manoobra" : "venta",
        productoId: item.productoId ? Number(item.productoId) : null,
        productoNombre: String(item.productoNombre || ""), productoCodigo: item.productoCodigo ? String(item.productoCodigo) : null,
        productoMarca: item.productoMarca ? String(item.productoMarca) : null,
        cantidad: String(parseFloat(String(item.cantidad))), precioCompraUnidad: String(parseFloat(String(item.precioCompraUnidad || 0))),
        precioVentaUnidad: String(parseFloat(String(item.precioVentaUnidad))), precioVentaTotal: String(parseFloat(String(item.precioVentaTotal))),
        beneficio: String(parseFloat(String(item.beneficio || 0))), descripcion: item.descripcion ? String(item.descripcion) : "Pago de crédito antiguo",
        formaPago: item.formaPago ? String(item.formaPago) : null, origen: "pago_credito_antiguo", afectaInventario: false,
      }));
      if (valores.some((item) => !item.fecha || !item.referencia || !item.productoNombre || !Number.isFinite(Number(item.precioVentaUnidad)))) throw new Error("Todas las filas deben tener fecha, referencia, concepto y precio de venta válidos");
      const insertadas = await tx.insert(ventasDiariasTable).values(valores).returning();
      if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "venta", entidadId: operationId, tipo: "crear_lote_pago_antiguo", metodo: "POST", endpoint: "/ventas/lote-pago-antiguo", payload: req.body, origen: "local" });
      await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "venta_lote_pago_antiguo", recursoId: insertadas[0].id }).onConflictDoNothing();
      return insertadas;
    });
    res.status(201).json(creadas.map(mapVenta));
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

router.post("/manoobra", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();

  if (operationId) {
    const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
    if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  }

  const { fecha, referencia, valorTotal, distribuciones, productoNombre, productoMarca, descripcion, formaPago } = req.body;

  try {
    const resultado = await db.transaction(async (tx) => {
      const [mo] = await tx.insert(manoObraTable).values({
        fecha, descripcion: referencia, valorTotal: String(parseFloat(valorTotal)),
      }).returning();

      for (const dist of distribuciones || []) {
        await tx.insert(distribucionesTable).values({
          manoObraId: mo.id,
          trabajadorId: dist.trabajadorId,
          trabajadorNombre: dist.trabajadorNombre || `Trabajador ${dist.trabajadorId}`,
          valor: String(parseFloat(dist.valor)),
          descuentoSeguro: "0",
          descuentoOtros: "0",
        });

        const [trab] = await tx.select().from(trabajadoresTable).where(eq(trabajadoresTable.id, dist.trabajadorId));
        if (trab) {
          await tx.update(trabajadoresTable)
            .set({ totalGanado: String(toNum(trab.totalGanado) + parseFloat(dist.valor || 0)) })
            .where(eq(trabajadoresTable.id, dist.trabajadorId));
        }
      }

      const [venta] = await tx.insert(ventasDiariasTable).values({
        fecha, referencia, tipoLinea: "manoobra",
        productoNombre: productoNombre || "Mano de Obra",
        productoMarca: productoMarca || null,
        cantidad: "1", precioCompraUnidad: "0",
        precioVentaUnidad: String(parseFloat(valorTotal)), precioVentaTotal: String(parseFloat(valorTotal)),
        beneficio: String(parseFloat(valorTotal)),
        descripcion: descripcion || null,
        formaPago: formaPago || null,
      }).returning();

      if (!req.header("x-sync-apply")) {
        await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "venta", entidadId: String(venta.id), tipo: "crear_manoobra", metodo: "POST", endpoint: "/ventas/manoobra", payload: req.body, origen: "local" });
      }
      await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "manoobra_venta", recursoId: venta.id }).onConflictDoNothing();

      return venta;
    });

    res.status(201).json(resultado);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── PUT /reordenar — guarda el nuevo orden después de arrastrar filas ──
// Debe declararse antes de PUT /:id para que "reordenar" no se interprete como un ID.
router.put("/reordenar", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  const { ids, fecha } = req.body as { ids: number[]; fecha?: string };
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    res.status(400).json({ error: "ids requerido" });
    return;
  }
  if (fecha !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    res.status(400).json({ error: "fecha inválida" });
    return;
  }

  const client = await pool.connect();
  try {
    const posiciones = ids.map((_, i) => i + 1);
    await client.query(
      `UPDATE ventas_diarias AS v SET orden = u.orden
       FROM UNNEST($1::int[], $2::int[]) AS u(id, orden)
        WHERE v.id = u.id
        ${fecha ? "AND v.fecha = $3::date" : ""}`,
            fecha ? [ids, posiciones, fecha] : [ids, posiciones],
    );
  } finally {
    client.release();
  }
  if (!req.header("x-sync-apply")) await db.insert(eventosSincronizacionTable).values({ operationId, entidad: "ventas_orden", entidadId: operationId, tipo: "reordenar", metodo: "PUT", endpoint: "/ventas/reordenar", payload: req.body, origen: "local" });
  await db.insert(operacionesSincronizadasTable).values({ operationId, tipo: "ventas_orden", recursoId: null }).onConflictDoNothing();
  res.json({ ok: true });
});

router.put("/:id", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = parseInt(req.params.id);
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  const {
    fecha, referencia, tipoLinea, productoId,
    productoNombre, productoCodigo, productoMarca,
    cantidad, precioCompraUnidad, precioVentaUnidad,
    precioVentaTotal, beneficio, descripcion, formaPago, origen, afectaInventario
  } = req.body;

  // Leer fila actual antes de modificar — necesario para el delta de stock y preservar descripción
  const [existing] = await db.select().from(ventasDiariasTable).where(eq(ventasDiariasTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Venta no encontrada" });
    return;
  }
  const esPagoCreditoAntiguo = existing.origen === "pago_credito_antiguo";
  const nuevaAfectaInventario = esPagoCreditoAntiguo ? false : afectaInventario !== undefined
    ? Boolean(afectaInventario)
    : existing.afectaInventario;

  const setData: Partial<typeof ventasDiariasTable.$inferInsert> = {
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
    formaPago: formaPago || null,
    origen: esPagoCreditoAntiguo ? existing.origen : origen || existing.origen,
    afectaInventario: nuevaAfectaInventario,
  };
  // Solo sobreescribir descripción si viene explícitamente en el payload;
  // si el frontend no la envía (undefined), se preserva la existente.
  if (descripcion !== undefined) setData.descripcion = descripcion || null;

  try {
    const venta = await db.transaction(async (tx) => {
      const [actualizada] = await tx
        .update(ventasDiariasTable)
        .set(setData)
        .where(eq(ventasDiariasTable.id, id))
        .returning();

      const oldEsVenta = existing.tipoLinea === "venta" || !existing.tipoLinea;
      const newEsVenta = tipoLinea === "venta" || !tipoLinea;
      const oldProdId = existing.productoId;
      const newProdId = productoId ? parseInt(String(productoId)) : null;
      const esFilaManual = !existing.creditoAbonoId;

      if (esFilaManual && oldEsVenta && existing.afectaInventario !== false && !esPagoCreditoAntiguo && oldProdId) {
        await ajustarStockVenta(tx, oldProdId, -toNum(existing.cantidad));
      }
      if (esFilaManual && newEsVenta && newProdId && nuevaAfectaInventario) {
        await ajustarStockVenta(tx, newProdId, parseFloat(String(cantidad)));
      }

      if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "venta", entidadId: String(id), tipo: "actualizar", metodo: "PUT", endpoint: `/ventas/${id}`, payload: req.body, origen: "local" });
      await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "venta", recursoId: id }).onConflictDoNothing();
      return actualizada;
    });
    res.json(mapVenta(venta));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete("/:id", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = parseInt(req.params.id);
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }

  try {
    await db.transaction(async (tx) => {
      const [venta] = await tx.select().from(ventasDiariasTable).where(eq(ventasDiariasTable.id, id));
      if (venta && venta.origen !== "pago_credito_antiguo" && (venta.tipoLinea === "venta" || !venta.tipoLinea) && venta.productoId && !venta.creditoAbonoId && venta.afectaInventario === true) {
        await ajustarStockVenta(tx, venta.productoId, -toNum(venta.cantidad));
      }

      await tx.delete(ventasDiariasTable).where(eq(ventasDiariasTable.id, id));
      if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "venta", entidadId: String(id), tipo: "eliminar", metodo: "DELETE", endpoint: `/ventas/${id}`, payload: {}, origen: "local" });
      await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "venta", recursoId: id }).onConflictDoNothing();
    });
    res.json({ mensaje: "Venta eliminada" });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/:id/trasladar", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = parseInt(req.params.id);
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  const { cantidad, direccion } = req.body as {
    cantidad: number;
    direccion: "bodega-local" | "local-bodega";
  };
  const cant = parseFloat(String(cantidad));
  if (!cant || cant <= 0) { res.status(400).json({ error: "Cantidad inválida" }); return; }

  const origen = direccion === "local-bodega" ? "stockLocal" : "stockBodega";
  const destino = direccion === "local-bodega" ? "stockBodega" : "stockLocal";

  const [prod] = await db.select().from(productosTable).where(eq(productosTable.id, id));
  if (!prod) { res.status(404).json({ error: "Producto no encontrado" }); return; }
  if (toNum(prod[origen]) < cant) {
    const nombreOrigen = direccion === "local-bodega" ? "local" : "bodega";
    res.status(400).json({ error: `Solo hay ${prod[origen]} en ${nombreOrigen}` });
    return;
  }

  const [actualizado] = await db.update(productosTable)
    .set({
      [origen]: sql`${productosTable[origen]} - ${cant}`,
      [destino]: sql`${productosTable[destino]} + ${cant}`,
      actualizadoEn: new Date(),
    })
    .where(eq(productosTable.id, id))
    .returning();

  if (!req.header("x-sync-apply")) await db.insert(eventosSincronizacionTable).values({ operationId, entidad: "producto", entidadId: String(id), tipo: "trasladar_stock", metodo: "POST", endpoint: `/ventas/${id}/trasladar`, payload: req.body, origen: "local" });
  await db.insert(operacionesSincronizadasTable).values({ operationId, tipo: "producto", recursoId: id }).onConflictDoNothing();

  res.json(actualizado);
});

export default router;
