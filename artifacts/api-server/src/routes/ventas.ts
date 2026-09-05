import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { ventasDiariasTable, productosTable } from "@workspace/db/schema";
import { eq, sql, and, gte, lte } from "drizzle-orm";
import { manoObraTable, distribucionesTable, trabajadoresTable, operacionesSincronizadasTable } from "@workspace/db/schema";

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
    const aCreado = a.creadoEn ? new Date(a.creadoEn).getTime() : 0;
    const bCreado = b.creadoEn ? new Date(b.creadoEn).getTime() : 0;
    if (aCreado !== bCreado) return aCreado - bCreado;
    return Number(a.id) - Number(b.id);
  });
  res.json(ordenadas.map(mapVenta));
});

router.post("/", async (req, res) => {
  const operationId = req.header("x-operation-id");

  if (operationId) {
    const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
    if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  }

  const {
    fecha, referencia, tipoLinea, productoId,
    productoNombre, productoCodigo, productoMarca,
    cantidad, precioCompraUnidad, precioVentaUnidad,
    precioVentaTotal, beneficio, descripcion, formaPago,
  } = req.body;

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
      }).returning();

      // Resta atómica de stock -- así una venta encolada offline nunca desface el inventario al sincronizar.
      const esVentaConProducto = (tipoLinea === "venta" || !tipoLinea) && productoId;
      if (esVentaConProducto) {
        const cantidadNum = parseFloat(cantidad);
        await tx.update(productosTable)
          .set({
            // Descuenta primero de Local; si no alcanza, el resto sale de Bodega
            stockLocal: sql`GREATEST(0, ${productosTable.stockLocal} - LEAST(${productosTable.stockLocal}, ${cantidadNum}))`,
            stockBodega: sql`GREATEST(0, ${productosTable.stockBodega} - GREATEST(0, ${cantidadNum} - ${productosTable.stockLocal}))`,
            stockActual: sql`GREATEST(0, ${productosTable.stockActual} - ${cantidadNum})`,
            actualizadoEn: new Date(),
          })
          .where(eq(productosTable.id, Number(productoId)));
      }

      if (operationId) {
        await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "venta", recursoId: creada.id }).onConflictDoNothing();
      }

      return creada;
    });

    res.status(201).json(mapVenta(venta));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/manoobra", async (req, res) => {
  const operationId = req.header("x-operation-id");

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

      if (operationId) {
        await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "manoobra_venta", recursoId: venta.id }).onConflictDoNothing();
      }

      return venta;
    });

    res.status(201).json(resultado);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const {
    fecha, referencia, tipoLinea, productoId,
    productoNombre, productoCodigo, productoMarca,
    cantidad, precioCompraUnidad, precioVentaUnidad,
    precioVentaTotal, beneficio, descripcion, formaPago
  } = req.body;

  // Leer fila actual antes de modificar — necesario para el delta de stock y preservar descripción
  const [existing] = await db.select().from(ventasDiariasTable).where(eq(ventasDiariasTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Venta no encontrada" });
    return;
  }

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
  };
  // Solo sobreescribir descripción si viene explícitamente en el payload;
  // si el frontend no la envía (undefined), se preserva la existente.
  if (descripcion !== undefined) setData.descripcion = descripcion || null;

  const [venta] = await db
    .update(ventasDiariasTable)
    .set(setData)
    .where(eq(ventasDiariasTable.id, id))
    .returning();

  // Ajustar stock solo para ventas manuales (filas de crédito tienen creditoAbonoId)
  if (!existing.creditoAbonoId) {
    const oldEsVenta = existing.tipoLinea === "venta" || !existing.tipoLinea;
    const newEsVenta = tipoLinea === "venta" || !tipoLinea;
    const oldProdId = existing.productoId;
    const newProdId = productoId ? parseInt(String(productoId)) : null;
    const cantidadNueva = parseFloat(String(cantidad));

    // 1. Restaurar stock del producto anterior (como si se "deshiciera" la venta vieja)
    if (oldEsVenta && oldProdId) {
      const [prod] = await db.select().from(productosTable).where(eq(productosTable.id, oldProdId));
      if (prod) {
        await db.update(productosTable)
          .set({ stockActual: String(toNum(prod.stockActual) + toNum(existing.cantidad)), actualizadoEn: new Date() })
          .where(eq(productosTable.id, oldProdId));
      }
    }

    // 2. Descontar stock del producto nuevo (aplica la venta editada)
    if (newEsVenta && newProdId) {
      const [prod] = await db.select().from(productosTable).where(eq(productosTable.id, newProdId));
      if (prod) {
        const nuevoStock = Math.max(0, toNum(prod.stockActual) - cantidadNueva);
        await db.update(productosTable)
          .set({ stockActual: String(nuevoStock), actualizadoEn: new Date() })
          .where(eq(productosTable.id, newProdId));
      }
    }
  }

  res.json(mapVenta(venta));
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  // Restore stock if it was a normal sale with product.
  // Filas auto-creadas por pagos de crédito (creditoAbonoId != null) no tocan stock —
  // el crédito ya descontó al crearse; restaurar aquí sería un doble conteo.
  const [venta] = await db.select().from(ventasDiariasTable).where(eq(ventasDiariasTable.id, id));
  if (venta && (venta.tipoLinea === "venta" || !venta.tipoLinea) && venta.productoId && !venta.creditoAbonoId) {
    const [prod] = await db.select().from(productosTable).where(eq(productosTable.id, venta.productoId));
    if (prod) {
        await db.update(productosTable)
        .set({ stockActual: sql`${productosTable.stockActual} + ${toNum(venta.cantidad)}`, actualizadoEn: new Date() })
        .where(eq(productosTable.id, venta.productoId));
    }
  }

  await db.delete(ventasDiariasTable).where(eq(ventasDiariasTable.id, id));
  res.json({ mensaje: "Venta eliminada" });
});

router.post("/:id/trasladar", async (req, res) => {
  const id = parseInt(req.params.id);
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

  res.json(actualizado);
});

// ─── PUT /reordenar — guarda el nuevo orden después de arrastrar filas ──
router.put("/reordenar", async (req, res) => {
  const { ids } = req.body as { ids: number[] }; // el arreglo COMPLETO de IDs, ya en el orden nuevo
  if (!Array.isArray(ids) || !ids.length) { res.status(400).json({ error: "ids requerido" }); return; }

  const client = await pool.connect();
  try {
    const posiciones = ids.map((_, i) => i + 1);
    await client.query(
      `UPDATE ventas_diarias AS v SET orden = u.orden
       FROM UNNEST($1::int[], $2::int[]) AS u(id, orden)
       WHERE v.id = u.id`,
      [ids, posiciones],
    );
    res.json({ ok: true });
  } finally {
    client.release();
  }
});

export default router;
