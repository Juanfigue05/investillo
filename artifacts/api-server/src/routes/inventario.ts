import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  eventosSincronizacionTable,
  movimientosInventarioTable,
  productosTable,
} from "@workspace/db/schema";
import { desc, eq, lte, sql } from "drizzle-orm";
import { operacionesSincronizadasTable } from "@workspace/db/schema";
import { parseNumeroColombia } from "@workspace/api-zod";
import {
  actualizarProductoRequest,
  actualizarStockRequest,
  ajustarStockFisicoRequest,
  crearProductoRequest,
} from "@workspace/api-zod/write-requests";
import { validarBody } from "../lib/validar-body";
import {
  bloquearProducto,
  guardarExistencias,
  leerExistencias,
  validarExistenciasNoNegativas,
} from "../lib/inventario-stock";

const router: IRouter = Router();

function calcPrecioConIva(precioSinIva: number): number {
  const conIva = precioSinIva * 1.19;
  return Math.ceil(conIva / 1000) * 1000;
}

function toNum(v: unknown): number {
  return typeof v === "string" ? Number(v) : Number(v);
}

function mapProducto(p: typeof productosTable.$inferSelect) {
  const stockActual = toNum(p.stockActual);
  const stockLocalRegistrado = toNum(p.stockLocal);
  const stockBodega = toNum(p.stockBodega);
  const stockLocal =
    stockLocalRegistrado === 0 && stockBodega === 0 && stockActual !== 0
      ? stockActual
      : stockLocalRegistrado;
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
    stockActual,
    stockLocal,
    stockBodega,
    stockMinimo: toNum(p.stockMinimo),
    activo: p.activo,
    creadoEn: p.creadoEn,
    actualizadoEn: p.actualizadoEn,
  };
}

function numero(v: unknown): number {
  return typeof v === "string" ? Number(v) : Number(v);
}

function mapMovimiento(
  movimiento: typeof movimientosInventarioTable.$inferSelect,
) {
  return {
    ...movimiento,
    cantidad: numero(movimiento.cantidad),
    stockLocalAntes: numero(movimiento.stockLocalAntes),
    stockLocalDespues: numero(movimiento.stockLocalDespues),
    stockBodegaAntes: numero(movimiento.stockBodegaAntes),
    stockBodegaDespues: numero(movimiento.stockBodegaDespues),
    stockActualAntes: numero(movimiento.stockActualAntes),
    stockActualDespues: numero(movimiento.stockActualDespues),
  };
}

router.get("/", async (req, res) => {
  const incluirInactivos = req.query.incluirInactivos === "true";
  const productos = await db
    .select()
    .from(productosTable)
    .where(incluirInactivos ? undefined : eq(productosTable.activo, true))
    .orderBy(productosTable.nombre);
  res.json(productos.map(mapProducto));
});

router.get("/movimientos", async (_req, res) => {
  const movimientos = await db
    .select()
    .from(movimientosInventarioTable)
    .orderBy(desc(movimientosInventarioTable.creadoEn))
    .limit(100);
  res.json(movimientos.map(mapMovimiento));
});

router.post("/:id/ajustes", async (req, res) => {
  if (!validarBody(ajustarStockFisicoRequest, req.body, res)) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "ID de producto no válido" });
    return;
  }

  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const { ubicacion, direccion, motivo, motivoOtro, observacion } = req.body;
  const cantidad = parseNumeroColombia(req.body.cantidad);
  const direccionFija: Record<string, string> = {
    danado: "restar",
    devolucion_fabrica: "restar",
    perdida_robo: "restar",
    entrada_extra: "sumar",
  };
  if (direccionFija[motivo] && direccionFija[motivo] !== direccion) {
    res.status(400).json({
      error: "La dirección de este motivo no se puede cambiar.",
    });
    return;
  }
  if (motivo === "otro" && !motivoOtro?.trim()) {
    res.status(400).json({ error: "Especifica el motivo del ajuste." });
    return;
  }

  try {
    const movimiento = await db.transaction(async (tx) => {
      const [reservada] = await tx
        .insert(operacionesSincronizadasTable)
        .values({ operationId, tipo: "ajuste_inventario", recursoId: id })
        .onConflictDoNothing()
        .returning();
      if (!reservada) return null;

      const producto = await bloquearProducto(tx, id);
      if (!producto) throw new Error("Producto no encontrado");
      const antes = leerExistencias(producto);
      const cambio = direccion === "sumar" ? cantidad : -cantidad;
      const localDespues =
        ubicacion === "local" ? antes.local + cambio : antes.local;
      const bodegaDespues =
        ubicacion === "bodega" ? antes.bodega + cambio : antes.bodega;
      if (localDespues < 0 || bodegaDespues < 0) {
        throw new Error(`No hay existencias suficientes en ${ubicacion}.`);
      }

      const actualizado = await guardarExistencias(
        tx,
        id,
        localDespues,
        bodegaDespues,
      );
      if (!actualizado) throw new Error("No se pudo actualizar el producto");

      const [creado] = await tx
        .insert(movimientosInventarioTable)
        .values({
          operationId,
          productoId: id,
          productoNombre: producto.nombre,
          productoCodigo: producto.codigo,
          tipo: "ajuste",
          motivo,
          ubicacion,
          direccion,
          cantidad: String(cantidad),
          stockLocalAntes: String(antes.local),
          stockLocalDespues: String(localDespues),
          stockBodegaAntes: String(antes.bodega),
          stockBodegaDespues: String(bodegaDespues),
          stockActualAntes: String(antes.total),
          stockActualDespues: String(localDespues + bodegaDespues),
          observacion:
            motivo === "otro"
              ? [motivoOtro?.trim(), observacion?.trim()]
                  .filter(Boolean)
                  .join(" — ") || null
              : observacion?.trim() || null,
        })
        .returning();

      if (!req.header("x-sync-apply")) {
        await tx.insert(eventosSincronizacionTable).values({
          operationId,
          entidad: "producto",
          entidadId: String(id),
          tipo: "crear",
          metodo: "POST",
          endpoint: `/inventario/${id}/ajustes`,
          payload: req.body,
          referenciasRespuesta: [],
          origen: "local",
        });
      }
      return creado;
    });

    if (!movimiento) {
      res.json({ ok: true, yaProcesado: true });
      return;
    }
    res.status(201).json(mapMovimiento(movimiento));
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get("/alertas", async (req, res) => {
  const productos = await db
    .select()
    .from(productosTable)
    .where(
      lte(productosTable.stockActual, sql`${productosTable.stockMinimo} + 1`),
    );
  res.json(productos.map(mapProducto));
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [producto] = await db
    .select()
    .from(productosTable)
    .where(eq(productosTable.id, id));
  if (!producto) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }
  res.json(mapProducto(producto));
});

router.post("/", async (req, res) => {
  if (!validarBody(crearProductoRequest, req.body, res)) return;
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  if (operationId) {
    const [ya] = await db
      .select()
      .from(operacionesSincronizadasTable)
      .where(eq(operacionesSincronizadasTable.operationId, operationId));
    if (ya) {
      res
        .status(200)
        .json({ ok: true, yaProcesado: true, recursoId: ya.recursoId });
      return;
    }
  }

  const {
    nombre,
    codigo,
    marca,
    tipo,
    referencia,
    adicional,
    precioCompra,
    precioVentaSinIva,
    tieneIva,
    stockActual,
    stockLocal,
    stockBodega,
    stockMinimo,
  } = req.body;

  const pvSinIva = parseNumeroColombia(precioVentaSinIva);
  const pvConIva = calcPrecioConIva(pvSinIva);
  const local =
    stockLocal === undefined
      ? parseNumeroColombia(stockActual)
      : parseNumeroColombia(stockLocal);
  const bodega =
    stockBodega === undefined ? 0 : parseNumeroColombia(stockBodega);

  const producto = await db.transaction(async (tx) => {
    const [created] = await tx.insert(productosTable).values({
      nombre,
      codigo,
      marca: marca || null,
      tipo: tipo || null,
      referencia: referencia || null,
      adicional: adicional || null,
      precioCompra: String(parseNumeroColombia(precioCompra)),
      precioVentaSinIva: String(pvSinIva),
      precioVentaConIva: String(pvConIva),
      tieneIva: Boolean(tieneIva),
      stockActual: String(local + bodega),
      stockLocal: String(local),
      stockBodega: String(bodega),
      stockMinimo: String(parseNumeroColombia(stockMinimo)),
    }).returning();
    if (!req.header("x-sync-apply")) {
      await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "producto", entidadId: String(created.id), tipo: "crear", metodo: "POST", endpoint: "/inventario", payload: req.body, origen: "local" });
    }
    await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "producto", recursoId: created.id }).onConflictDoNothing();
    return created;
  });
  res.status(201).json(mapProducto(producto));
});

router.put("/:id", async (req, res) => {
  if (!validarBody(actualizarProductoRequest, req.body, res)) return;
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "ID de producto no válido" });
    return;
  }
  const {
    nombre,
    codigo,
    marca,
    tipo,
    referencia,
    adicional,
    precioCompra,
    precioVentaSinIva,
    tieneIva,
    stockMinimo,
    activo,
  } = req.body;

  const pvSinIva = parseNumeroColombia(precioVentaSinIva);
  const pvConIva = calcPrecioConIva(pvSinIva);
  try {
    const resultado = await db.transaction(async (tx) => {
      const [reservada] = await tx
        .insert(operacionesSincronizadasTable)
        .values({ operationId, tipo: "producto", recursoId: id })
        .onConflictDoNothing()
        .returning();
      if (!reservada) return { yaProcesado: true as const, recursoId: id };

      const existente = await bloquearProducto(tx, id);
      if (!existente) throw new Error("Producto no encontrado");
      const antes = leerExistencias(existente);
      const cambiaStock =
        req.body.stockLocal !== undefined ||
        req.body.stockBodega !== undefined ||
        req.body.stockActual !== undefined;
      const local = cambiaStock
        ? req.body.stockLocal === undefined
          ? req.body.stockActual === undefined
            ? antes.local
            : parseNumeroColombia(req.body.stockActual) - antes.bodega
          : parseNumeroColombia(req.body.stockLocal)
        : numero(existente.stockLocal);
      const bodega = cambiaStock
        ? req.body.stockBodega === undefined
          ? antes.bodega
          : parseNumeroColombia(req.body.stockBodega)
        : numero(existente.stockBodega);
      if (local < 0 || bodega < 0) {
        throw new Error("Las existencias no pueden quedar en negativo.");
      }

      const [updated] = await tx
        .update(productosTable)
        .set({
          nombre,
          codigo,
          marca: marca || null,
          tipo: tipo || null,
          referencia: referencia || null,
          adicional: adicional || null,
          precioCompra: String(parseNumeroColombia(precioCompra)),
          precioVentaSinIva: String(pvSinIva),
          precioVentaConIva: String(pvConIva),
          tieneIva: Boolean(tieneIva),
          ...(cambiaStock
            ? {
                stockLocal: String(local),
                stockBodega: String(bodega),
                stockActual: String(local + bodega),
              }
            : {}),
          stockMinimo: String(parseNumeroColombia(stockMinimo)),
          activo: activo !== undefined ? Boolean(activo) : undefined,
          actualizadoEn: new Date(),
        })
        .where(eq(productosTable.id, id))
        .returning();
      if (!updated) throw new Error("No se pudo actualizar el producto");

      if (cambiaStock) {
        let localAntes = antes.local;
        let bodegaAntes = antes.bodega;
        for (const [ubicacion, cantidad, direccion] of [
          ["local", Math.abs(local - antes.local), local >= antes.local ? "sumar" : "restar"],
          ["bodega", Math.abs(bodega - antes.bodega), bodega >= antes.bodega ? "sumar" : "restar"],
        ] as const) {
          if (cantidad === 0) continue;
          const localDespues = ubicacion === "local" ? local : localAntes;
          const bodegaDespues = ubicacion === "bodega" ? bodega : bodegaAntes;
          await tx.insert(movimientosInventarioTable).values({
            operationId,
            productoId: id,
            productoNombre: existente.nombre,
            productoCodigo: existente.codigo,
            tipo: "ajuste",
            motivo: "conteo",
            ubicacion,
            direccion,
            cantidad: String(cantidad),
            stockLocalAntes: String(localAntes),
            stockLocalDespues: String(localDespues),
            stockBodegaAntes: String(bodegaAntes),
            stockBodegaDespues: String(bodegaDespues),
            stockActualAntes: String(localAntes + bodegaAntes),
            stockActualDespues: String(localDespues + bodegaDespues),
            observacion: "Conteo físico desde edición de producto",
          });
          localAntes = localDespues;
          bodegaAntes = bodegaDespues;
        }
      }

      if (!req.header("x-sync-apply")) {
        await tx.insert(eventosSincronizacionTable).values({
          operationId,
          entidad: "producto",
          entidadId: String(id),
          tipo: "actualizar",
          metodo: "PUT",
          endpoint: `/inventario/${id}`,
          payload: req.body,
          origen: "local",
        });
      }
      return { producto: updated };
    });

    if ("yaProcesado" in resultado) {
      res.json({
        ok: true,
        yaProcesado: true,
        recursoId: resultado.recursoId,
      });
      return;
    }
    res.json(mapProducto(resultado.producto));
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.put("/:id/stock", async (req, res) => {
  if (!validarBody(actualizarStockRequest, req.body, res)) return;
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "ID de producto no válido" });
    return;
  }
  const { cantidad, precioCompra, precioVentaSinIva, tieneIva } = req.body;
  try {
    const resultado = await db.transaction(async (tx) => {
      const [reservada] = await tx
        .insert(operacionesSincronizadasTable)
        .values({ operationId, tipo: "producto", recursoId: id })
        .onConflictDoNothing()
        .returning();
      if (!reservada) return null;

      const existente = await bloquearProducto(tx, id);
      if (!existente) throw new Error("Producto no encontrado");
      const antes = leerExistencias(existente);
      const cambio = parseNumeroColombia(cantidad);
      const totalAnterior = antes.local + antes.bodega;
      if (totalAnterior + cambio < 0) {
        throw new Error("No hay existencias suficientes para descontar.");
      }

      let local = antes.local;
      let bodega = antes.bodega;
      if (cambio >= 0) {
        local += cambio;
      } else {
        const descuento = -cambio;
        const desdeLocal = Math.min(local, descuento);
        local -= desdeLocal;
        bodega -= descuento - desdeLocal;
      }
      validarExistenciasNoNegativas({ local, bodega, total: local + bodega });
      const actualizado = await guardarExistencias(tx, id, local, bodega);
      if (!actualizado) throw new Error("No se pudo actualizar el producto");

      let localAntes = antes.local;
      let bodegaAntes = antes.bodega;
      for (const [ubicacion, nuevoValor] of [
        ["local", local],
        ["bodega", bodega],
      ] as const) {
        const anterior = ubicacion === "local" ? localAntes : bodegaAntes;
        const diferencia = nuevoValor - anterior;
        if (diferencia === 0) continue;
        const localDespues = ubicacion === "local" ? nuevoValor : localAntes;
        const bodegaDespues =
          ubicacion === "bodega" ? nuevoValor : bodegaAntes;
        await tx.insert(movimientosInventarioTable).values({
          operationId,
          productoId: id,
          productoNombre: existente.nombre,
          productoCodigo: existente.codigo,
          tipo: "ajuste",
          motivo: "otro",
          ubicacion,
          direccion: diferencia > 0 ? "sumar" : "restar",
          cantidad: String(Math.abs(diferencia)),
          stockLocalAntes: String(localAntes),
          stockLocalDespues: String(localDespues),
          stockBodegaAntes: String(bodegaAntes),
          stockBodegaDespues: String(bodegaDespues),
          stockActualAntes: String(localAntes + bodegaAntes),
          stockActualDespues: String(localDespues + bodegaDespues),
          observacion: "Ajuste desde endpoint heredado de stock",
        });
        localAntes = localDespues;
        bodegaAntes = bodegaDespues;
      }

      const updateData: Partial<typeof productosTable.$inferInsert> = {
        actualizadoEn: new Date(),
      };
      if (precioCompra !== undefined) {
        updateData.precioCompra = String(parseNumeroColombia(precioCompra));
      }
      if (precioVentaSinIva !== undefined) {
        const pvSinIva = parseNumeroColombia(precioVentaSinIva);
        const haIva = tieneIva !== undefined ? Boolean(tieneIva) : existente.tieneIva;
        updateData.precioVentaSinIva = String(pvSinIva);
        updateData.precioVentaConIva = String(
          haIva ? calcPrecioConIva(pvSinIva) : pvSinIva,
        );
        if (tieneIva !== undefined) updateData.tieneIva = Boolean(tieneIva);
      }
      const [producto] = await tx
        .update(productosTable)
        .set(updateData)
        .where(eq(productosTable.id, id))
        .returning();
      if (!req.header("x-sync-apply")) {
        await tx.insert(eventosSincronizacionTable).values({
          operationId,
          entidad: "producto",
          entidadId: String(id),
          tipo: "actualizar_stock",
          metodo: "PUT",
          endpoint: `/inventario/${id}/stock`,
          payload: req.body,
          origen: "local",
        });
      }
      return { producto };
    });

    if (!resultado) {
      res.json({ ok: true, yaProcesado: true, recursoId: id });
      return;
    }
    res.json(mapProducto(resultado.producto));
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.delete("/:id", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  const id = parseInt(req.params.id);
  await db.transaction(async (tx) => {
    await tx.update(productosTable).set({ activo: false }).where(eq(productosTable.id, id));
    if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "producto", entidadId: String(id), tipo: "desactivar", metodo: "DELETE", endpoint: `/inventario/${id}`, payload: req.body ?? {}, origen: "local" });
    await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "producto", recursoId: id }).onConflictDoNothing();
  });
  res.json({ mensaje: "Producto marcado como inactivo" });
});

router.put("/:id/reactivar", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  const id = parseInt(req.params.id);
  const producto = await db.transaction(async (tx) => {
    const [updated] = await tx.update(productosTable).set({ activo: true, actualizadoEn: new Date() }).where(eq(productosTable.id, id)).returning();
    if (updated && !req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "producto", entidadId: String(id), tipo: "reactivar", metodo: "PUT", endpoint: `/inventario/${id}/reactivar`, payload: req.body ?? {}, origen: "local" });
    if (updated) await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "producto", recursoId: id }).onConflictDoNothing();
    return updated;
  });
  if (!producto) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }
  res.json(mapProducto(producto));
});

export default router;
