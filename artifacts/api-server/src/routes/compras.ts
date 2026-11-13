import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { comprasTable, eventosSincronizacionTable, historialPreciosTable, movimientosInventarioTable, productosTable, type PreciosInventarioCompra } from "@workspace/db/schema";
import { eq, and, gte, inArray } from "drizzle-orm";
import { operacionesSincronizadasTable } from "@workspace/db/schema";
import { fechaHoyColombia, fechaColombia } from "../lib/fecha";
import { parseNumeroColombia } from "@workspace/api-zod";
import {
  actualizarCompraRequest,
  corregirCompraRequest,
  crearCompraRequest,
  llegadaLoteComprasRequest,
} from "@workspace/api-zod/write-requests";
import { validarBody } from "../lib/validar-body";
import {
  bloquearProducto,
  guardarExistencias,
  leerExistencias,
  validarExistenciasNoNegativas,
} from "../lib/inventario-stock";
import { resumirComprasRecibidas } from "../lib/compras-resumen";

const router: IRouter = Router();
type CompraTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

router.get("/resumen-diario", async (req, res) => {
  const fecha = String(req.query.fecha || "");
  const fechaParseada = new Date(`${fecha}T00:00:00.000Z`);
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fecha) &&
    Number.isFinite(fechaParseada.getTime()) &&
    fechaParseada.toISOString().slice(0, 10) === fecha;
  if (!fechaValida) {
    res.status(400).json({ error: "El parámetro fecha debe tener formato YYYY-MM-DD." });
    return;
  }
  const llegadas = await db
    .select()
    .from(comprasTable)
    .where(and(eq(comprasTable.estado, "llegado"), eq(comprasTable.fechaLlegada, fecha)));
  res.json(resumirComprasRecibidas(llegadas, fecha));
});

class CompraRouteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function errorStatus(error: unknown): number {
  return error instanceof CompraRouteError ? error.status : 500;
}

async function operacionYaProcesada(
  tx: CompraTransaction,
  operationId: string,
) {
  const [operacion] = await tx
    .select()
    .from(operacionesSincronizadasTable)
    .where(eq(operacionesSincronizadasTable.operationId, operationId));
  return operacion;
}

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
    tieneSnapshotPrecios: Boolean(
      c.preciosInventarioAntes && c.preciosInventarioAplicados,
    ),
    creadoEn: c.creadoEn,
    actualizadoEn: c.actualizadoEn,
  };
}

function calcPrecioConIva(precioSinIva: number): number {
  const conIva = precioSinIva * 1.19;
  return Math.ceil(conIva / 1000) * 1000;
}

async function registrarMovimientoCompra(
  tx: CompraTransaction,
  operationId: string,
  producto: typeof productosTable.$inferSelect,
  localAntes: number,
  bodegaAntes: number,
  localDespues: number,
  bodegaDespues: number,
  motivo: string,
) {
  let local = localAntes;
  let bodega = bodegaAntes;
  for (const [ubicacion, nuevoValor] of [
    ["local", localDespues],
    ["bodega", bodegaDespues],
  ] as const) {
    const anterior = ubicacion === "local" ? local : bodega;
    const diferencia = nuevoValor - anterior;
    if (diferencia === 0) continue;
    const localNuevo = ubicacion === "local" ? nuevoValor : local;
    const bodegaNuevo = ubicacion === "bodega" ? nuevoValor : bodega;
    await tx.insert(movimientosInventarioTable).values({
      operationId,
      productoId: producto.id,
      productoNombre: producto.nombre,
      productoCodigo: producto.codigo,
      tipo: "ajuste",
      motivo,
      ubicacion,
      direccion: diferencia > 0 ? "sumar" : "restar",
      cantidad: String(Math.abs(diferencia)),
      stockLocalAntes: String(local),
      stockLocalDespues: String(localNuevo),
      stockBodegaAntes: String(bodega),
      stockBodegaDespues: String(bodegaNuevo),
      stockActualAntes: String(local + bodega),
      stockActualDespues: String(localNuevo + bodegaNuevo),
    });
    local = localNuevo;
    bodega = bodegaNuevo;
  }
}

async function ajustarStockPorCompra(
  tx: CompraTransaction,
  operationId: string,
  productoId: number,
  delta: number,
  motivo: string,
  distribucionEntrada?: { local: number; bodega: number },
) {
  if (delta === 0) return;
  const producto = await bloquearProducto(tx, productoId);
  if (!producto) {
    throw new CompraRouteError(
      `Producto ${productoId} no encontrado para ajustar la compra.`,
      404,
    );
  }
  const antes = leerExistencias(producto);
  validarExistenciasNoNegativas(antes);
  if (antes.local + antes.bodega + delta < -0.0001) {
    throw new CompraRouteError(
      "No se puede revertir la compra: ya no hay existencias suficientes. Revisa las ventas y realiza un conteo físico.",
      409,
    );
  }

  let local = antes.local;
  let bodega = antes.bodega;
  if (delta > 0) {
    const cantidadLocal = distribucionEntrada?.local ?? delta;
    const cantidadBodega = distribucionEntrada?.bodega ?? 0;
    if (
      cantidadLocal < 0 ||
      cantidadBodega < 0 ||
      Math.abs(cantidadLocal + cantidadBodega - delta) > 0.0001
    ) {
      throw new CompraRouteError(
        "La distribución de existencias de la compra no coincide con la cantidad recibida.",
        400,
      );
    }
    local += cantidadLocal;
    bodega += cantidadBodega;
  } else {
    const cantidadRestar = -delta;
    const restarLocal = Math.min(local, cantidadRestar);
    local -= restarLocal;
    bodega -= cantidadRestar - restarLocal;
  }
  await guardarExistencias(tx, productoId, local, bodega);
  await registrarMovimientoCompra(
    tx,
    operationId,
    producto,
    antes.local,
    antes.bodega,
    local,
    bodega,
    motivo,
  );
}

function leerPreciosInventario(
  producto: typeof productosTable.$inferSelect,
): PreciosInventarioCompra {
  return {
    precioCompra: toNum(producto.precioCompra),
    precioVentaSinIva: toNum(producto.precioVentaSinIva),
    precioVentaConIva: toNum(producto.precioVentaConIva),
    tieneIva: producto.tieneIva,
  };
}

function preciosCoinciden(
  actual: PreciosInventarioCompra,
  esperado: PreciosInventarioCompra,
): boolean {
  return (
    Math.abs(actual.precioCompra - esperado.precioCompra) < 0.01 &&
    Math.abs(actual.precioVentaSinIva - esperado.precioVentaSinIva) < 0.01 &&
    Math.abs(actual.precioVentaConIva - esperado.precioVentaConIva) < 0.01 &&
    actual.tieneIva === esperado.tieneIva
  );
}

async function restaurarPreciosCompra(
  tx: CompraTransaction,
  compra: typeof comprasTable.$inferSelect,
  restauracionManual?: {
    anteriores: PreciosInventarioCompra;
    actualesEsperados: PreciosInventarioCompra;
  },
  permitirOmitirRestauracion = false,
): Promise<{ restaurado: boolean; historialPrecioId?: number }> {
  const historiales = await tx
    .select({
      actualizoPrecioInventario: historialPreciosTable.actualizoPrecioInventario,
    })
    .from(historialPreciosTable)
    .where(eq(historialPreciosTable.compraId, compra.id));
  const tieneSnapshot =
    compra.preciosInventarioAntes !== null &&
    compra.preciosInventarioAplicados !== null;
  const debeRestaurar = tieneSnapshot
    ? compra.preciosInventarioActualizados
    : historiales.some((registro) => registro.actualizoPrecioInventario === "si");
  if (!debeRestaurar) return { restaurado: true };

  const producto = await bloquearProducto(tx, compra.productoId);
  if (!producto) {
    throw new CompraRouteError(
      `Producto ${compra.productoId} no encontrado para restaurar sus precios.`,
      404,
    );
  }

  const preciosActuales = leerPreciosInventario(producto);
  let preciosAnteriores: PreciosInventarioCompra | null = null;
  if (
    compra.preciosInventarioAntes &&
    compra.preciosInventarioAplicados &&
    preciosCoinciden(preciosActuales, compra.preciosInventarioAplicados)
  ) {
    preciosAnteriores = compra.preciosInventarioAntes;
  } else if (
    restauracionManual &&
    preciosCoinciden(preciosActuales, restauracionManual.actualesEsperados)
  ) {
    preciosAnteriores = restauracionManual.anteriores;
  } else if (permitirOmitirRestauracion) {
    return { restaurado: false };
  } else if (restauracionManual) {
    throw new CompraRouteError(
      "Los precios actuales del producto cambiaron mientras corregías la compra. Actualiza la pantalla y vuelve a intentarlo.",
      409,
    );
  } else if (!compra.preciosInventarioAntes || !compra.preciosInventarioAplicados) {
    throw new CompraRouteError(
      "Esta compra antigua no conserva los precios anteriores. Ingresa los precios anteriores del producto y vuelve a guardar la corrección.",
      409,
    );
  } else {
    throw new CompraRouteError(
      "El precio del producto cambió después de la llegada. Ingresa los precios que deseas restaurar y vuelve a guardar la corrección.",
      409,
    );
  }

  await tx.update(productosTable).set({
    precioCompra: String(preciosAnteriores.precioCompra),
    precioVentaSinIva: String(preciosAnteriores.precioVentaSinIva),
    precioVentaConIva: String(preciosAnteriores.precioVentaConIva),
    tieneIva: preciosAnteriores.tieneIva,
    actualizadoEn: new Date(),
  }).where(eq(productosTable.id, producto.id));
  const [historialPrecio] = await tx.insert(historialPreciosTable).values({
    productoId: producto.id,
    productoNombre: producto.nombre,
    productoCodigo: producto.codigo,
    precioCompra: String(preciosAnteriores.precioCompra),
    precioVenta: String(preciosAnteriores.precioVentaConIva),
    fecha: fechaHoyColombia(),
    origen: "reversion_compra",
    compraId: compra.id,
    proveedor: compra.proveedor,
    actualizoPrecioInventario: "si",
  }).returning({ id: historialPreciosTable.id });
  return { restaurado: true, historialPrecioId: historialPrecio.id };
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
  if (!validarBody(crearCompraRequest, req.body, res)) return;
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

async function procesarLlegadaCompra(
  tx: CompraTransaction,
  operationId: string,
  existing: typeof comprasTable.$inferSelect,
  datos: LlegadaInput,
) {
  const { estado, cantidadRecibida, cantidadLocal, cantidadBodega, nuevoPrecioCompra, nuevoPrecioVentaSinIva, tieneIva, proveedor, actualizarPrecioInventario, fechaLlegada } = datos;

  if (estado === "llegado" && existing.estado === "llegado") {
    throw new CompraRouteError(
      "Esta compra ya está marcada como llegada. Para cambiar sus datos, use la corrección de compra.",
      409,
    );
  }

  let precioCompraFinal: number | null = null;
  let precioVentaFinal: number | null = null;
  let precioVentaSinIvaRegistrado: number | null = null;
  let historialPrecioId: number | undefined;
  let preciosModificados = false;
  let cantidadLocalRecibida: number | null = null;
  let cantidadBodegaRecibida: number | null = null;
  let preciosInventarioAntes: PreciosInventarioCompra | null = null;
  let preciosInventarioAplicados: PreciosInventarioCompra | null = null;
  let preciosInventarioActualizados = false;

  if (estado === "llegado") {
    const cantidadNum = parseNumeroColombia(cantidadRecibida);
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
      throw new CompraRouteError(
        "La cantidad recibida debe ser mayor que cero.",
        400,
      );
    }
    const producto = await bloquearProducto(tx, existing.productoId);
    if (!producto) {
      throw new CompraRouteError(
        `Producto ${existing.productoId} no encontrado para registrar la llegada.`,
        404,
      );
    }
    preciosInventarioAntes = leerPreciosInventario(producto);
    const localSolicitado =
      cantidadLocal === undefined || cantidadLocal === null
        ? null
        : parseNumeroColombia(cantidadLocal);
    const bodegaSolicitada =
      cantidadBodega === undefined || cantidadBodega === null
        ? null
        : parseNumeroColombia(cantidadBodega);
    const cantidadLocalFinal =
      localSolicitado ?? Math.max(0, cantidadNum - (bodegaSolicitada ?? 0));
    const cantidadBodegaFinal =
      bodegaSolicitada ?? Math.max(0, cantidadNum - cantidadLocalFinal);
    cantidadLocalRecibida = cantidadLocalFinal;
    cantidadBodegaRecibida = cantidadBodegaFinal;
    if (
      cantidadLocalFinal < 0 ||
      cantidadBodegaFinal < 0 ||
      Math.abs(cantidadLocalFinal + cantidadBodegaFinal - cantidadNum) > 0.0001
    ) {
      throw new CompraRouteError(
        "La cantidad de Local y Bodega debe coincidir con la cantidad recibida.",
        400,
      );
    }
    const existencias = leerExistencias(producto);
    validarExistenciasNoNegativas(existencias);
    const localDespues = existencias.local + cantidadLocalFinal;
    const bodegaDespues = existencias.bodega + cantidadBodegaFinal;
    const updateProd: Record<string, unknown> = {
      actualizadoEn: new Date(),
    };

    if (nuevoPrecioCompra !== undefined && nuevoPrecioCompra !== "") {
      precioCompraFinal = parseNumeroColombia(nuevoPrecioCompra);
      if (Math.abs(precioCompraFinal - toNum(producto.precioCompra)) > 0.01) preciosModificados = true;
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
    preciosInventarioActualizados = actualizarPrecioInventario !== false;
    preciosInventarioAplicados = {
      precioCompra:
        updateProd.precioCompra === undefined
          ? preciosInventarioAntes.precioCompra
          : toNum(updateProd.precioCompra),
      precioVentaSinIva:
        updateProd.precioVentaSinIva === undefined
          ? preciosInventarioAntes.precioVentaSinIva
          : toNum(updateProd.precioVentaSinIva),
      precioVentaConIva:
        updateProd.precioVentaConIva === undefined
          ? preciosInventarioAntes.precioVentaConIva
          : toNum(updateProd.precioVentaConIva),
      tieneIva:
        typeof updateProd.tieneIva === "boolean"
          ? updateProd.tieneIva
          : preciosInventarioAntes.tieneIva,
    };

    await guardarExistencias(
      tx,
      existing.productoId,
      localDespues,
      bodegaDespues,
    );
    await registrarMovimientoCompra(
      tx,
      operationId,
      producto,
      existencias.local,
      existencias.bodega,
      localDespues,
      bodegaDespues,
      "compra_llegada",
    );
    await tx
      .update(productosTable)
      .set(updateProd)
      .where(eq(productosTable.id, existing.productoId));

    const hoy = fechaHoyColombia();
    const [historialPrecio] = await tx
      .insert(historialPreciosTable)
      .values({
        productoId: existing.productoId,
        productoNombre: existing.productoNombre,
        productoCodigo: existing.productoCodigo,
        precioCompra: String(precioCompraFinal),
        precioVenta: String(precioVentaFinal),
        fecha: hoy,
        origen: "compra",
        compraId: existing.id,
        proveedor: proveedor || null,
        actualizoPrecioInventario: actualizarPrecioInventario !== false ? "si" : "no",
      })
      .returning({ id: historialPreciosTable.id });
    historialPrecioId = historialPrecio.id;
  }

  const updateData: Partial<typeof comprasTable.$inferInsert> = { estado, actualizadoEn: new Date() };
  if (cantidadRecibida !== undefined && cantidadRecibida !== null) {
    updateData.cantidadRecibida = String(parseNumeroColombia(cantidadRecibida));
  }
  if (cantidadLocalRecibida !== null) {
    updateData.cantidadLocalRecibida = String(cantidadLocalRecibida);
  }
  if (cantidadBodegaRecibida !== null) {
    updateData.cantidadBodegaRecibida = String(cantidadBodegaRecibida);
  }
  if (estado === "llegado") {
    updateData.preciosInventarioAntes = preciosInventarioAntes;
    updateData.preciosInventarioAplicados = preciosInventarioAplicados;
    updateData.preciosInventarioActualizados = preciosInventarioActualizados;
  }
  if (estado === "llegado") updateData.fechaLlegada = fechaLlegada || fechaHoyColombia();
  if (proveedor !== undefined) updateData.proveedor = proveedor || null;
  if (precioCompraFinal !== null) updateData.precioCompraRegistrado = String(precioCompraFinal);
  if (precioVentaFinal !== null) {
    // Compras muestra y conserva el precio de venta sin IVA.
    updateData.precioVentaRegistrado = String(precioVentaSinIvaRegistrado ?? precioVentaFinal);
  }

  const [compra] = await tx
    .update(comprasTable)
    .set(updateData)
    .where(eq(comprasTable.id, existing.id))
    .returning();
  return { compra, preciosModificados, historialPrecioId };
}

router.put("/:id", async (req, res) => {
  if (!validarBody(actualizarCompraRequest, req.body, res)) return;
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = parseInt(req.params.id);

  try {
    const resultado = await db.transaction(async (tx) => {
      const yaInicial = await operacionYaProcesada(tx, operationId);
      if (yaInicial) {
        return { yaProcesado: true as const, recursoId: yaInicial.recursoId };
      }
      const [existing] = await tx
        .select()
        .from(comprasTable)
        .where(eq(comprasTable.id, id))
        .for("update");
      if (!existing) {
        throw new CompraRouteError(`Compra ${id} no encontrada.`, 404);
      }
      const ya = await operacionYaProcesada(tx, operationId);
      if (ya) {
        return { yaProcesado: true as const, recursoId: ya.recursoId };
      }

      const { compra, preciosModificados, historialPrecioId } =
        await procesarLlegadaCompra(tx, operationId, existing, req.body);
      if (!req.header("x-sync-apply")) {
        await tx.insert(eventosSincronizacionTable).values({
          operationId,
          entidad: "compra",
          entidadId: String(compra.id),
          tipo: "llegada",
          metodo: "PUT",
          endpoint: `/compras/${id}`,
          payload: req.body,
          referenciasRespuesta: historialPrecioId === undefined
            ? []
            : [{
                campo: "_syncHistorialPrecioId",
                entidad: "historial_precios",
                valorLocal: String(historialPrecioId),
              }],
          origen: "local",
        });
      }
      await tx.insert(operacionesSincronizadasTable).values({
        operationId,
        tipo: "compra",
        recursoId: compra.id,
      }).onConflictDoNothing();
      return {
        yaProcesado: false as const,
        compra,
        preciosModificados,
        historialPrecioId,
      };
    });
    if (resultado.yaProcesado) {
      res.status(200).json({
        ok: true,
        yaProcesado: true,
        recursoId: resultado.recursoId,
      });
      return;
    }
    res.json({
      ...mapCompra(resultado.compra),
      preciosModificados: resultado.preciosModificados,
      _syncHistorialPrecioId: resultado.historialPrecioId,
    });
  } catch (err) {
    res.status(errorStatus(err)).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

router.post("/lote-llegada", async (req, res) => {
  if (!validarBody(llegadaLoteComprasRequest, req.body, res)) return;
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const { proveedor, fechaLlegada, items } = req.body as { proveedor: string; fechaLlegada?: string; items: Array<{ id: number; cantidadRecibida: number; cantidadLocal?: number; cantidadBodega?: number; nuevoPrecioCompra: number; nuevoPrecioVentaSinIva: number; tieneIva: boolean; actualizarPrecioInventario: boolean }> };

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "Selecciona al menos un producto" });
    return;
  }

  for (const item of items) {
    const recibida = toNum(item.cantidadRecibida);
    const distribuida = toNum(item.cantidadLocal) + toNum(item.cantidadBodega);
    if (recibida <= 0) {
      res.status(400).json({ error: `La cantidad recibida debe ser mayor que cero en el producto ${item.id}.` });
      return;
    }
    if (!Number.isFinite(recibida)) {
      res.status(400).json({ error: `La cantidad recibida no es válida en la compra ${item.id}.` });
      return;
    }
    if (Math.abs(recibida - distribuida) > 0.001) {
      res.status(400).json({ error: `La cantidad de Local + Bodega debe coincidir con la recibida en el producto ${item.id}.` });
      return;
    }
  }
  const ids = items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    res.status(400).json({ error: "La misma compra no puede aparecer más de una vez en el lote." });
    return;
  }

  try {
    const resultado = await db.transaction(async (tx) => {
      const yaInicial = await operacionYaProcesada(tx, operationId);
      if (yaInicial) {
        return { yaProcesado: true as const, recursoId: yaInicial.recursoId };
      }

      const compras = await tx
        .select()
        .from(comprasTable)
        .where(inArray(comprasTable.id, ids))
        .orderBy(comprasTable.id)
        .for("update");
      const yaTrasBloqueo = await operacionYaProcesada(tx, operationId);
      if (yaTrasBloqueo) {
        return { yaProcesado: true as const, recursoId: yaTrasBloqueo.recursoId };
      }
      if (compras.length !== ids.length) {
        const encontrados = new Set(compras.map((compra) => compra.id));
        const faltante = ids.find((id) => !encontrados.has(id));
        throw new CompraRouteError(
          `Compra ${faltante} no encontrada.`,
          404,
        );
      }
      const compraPorId = new Map(compras.map((compra) => [compra.id, compra]));
      for (const item of items) {
        const compra = compraPorId.get(item.id);
        if (compra?.estado === "llegado") {
          throw new CompraRouteError(
            `La compra ${item.id} ya está marcada como llegada. Use la corrección de compra.`,
            409,
          );
        }
      }

      const resultados: Array<
        ReturnType<typeof mapCompra> & {
          preciosModificados: boolean;
          _syncHistorialPrecioId?: number;
        }
      > = [];
      const referenciasRespuesta: Array<{
        campo: string;
        entidad: string;
        valorLocal: string;
      }> = [];
      for (const [index, item] of items.entries()) {
        const compraExistente = compraPorId.get(item.id);
        if (!compraExistente) {
          throw new CompraRouteError(`Compra ${item.id} no encontrada.`, 404);
        }
        const { compra, preciosModificados, historialPrecioId } =
          await procesarLlegadaCompra(tx, operationId, compraExistente, {
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
        resultados.push({
          ...mapCompra(compra),
          preciosModificados,
          _syncHistorialPrecioId: historialPrecioId,
        });
        if (historialPrecioId !== undefined) {
          referenciasRespuesta.push({
            campo: `resultados.${index}._syncHistorialPrecioId`,
            entidad: "historial_precios",
            valorLocal: String(historialPrecioId),
          });
        }
      }

      if (!req.header("x-sync-apply")) {
        await tx.insert(eventosSincronizacionTable).values({
          operationId,
          entidad: "compra_lote",
          entidadId: operationId,
          tipo: "lote_llegada",
          metodo: "POST",
          endpoint: "/compras/lote-llegada",
          payload: req.body,
          referenciasRespuesta,
          origen: "local",
        });
      }
      await tx.insert(operacionesSincronizadasTable).values({
        operationId,
        tipo: "compra_lote",
        recursoId: null,
      }).onConflictDoNothing();
      return { yaProcesado: false as const, resultados };
    });

    if (resultado.yaProcesado) {
      res.status(200).json({
        ok: true,
        yaProcesado: true,
        recursoId: resultado.recursoId,
      });
      return;
    }
    const resultados = resultado.resultados;
  res.json({
    ok: true,
    procesados: resultados.length,
    resultados,
  });
  } catch (err) {
    res.status(errorStatus(err)).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

router.delete("/:id", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "ID de compra no válido" }); return; }

  try {
    const eliminado = await db.transaction(async (tx) => {
      const [reservada] = await tx.insert(operacionesSincronizadasTable)
        .values({ operationId, tipo: "compra", recursoId: id })
        .onConflictDoNothing()
        .returning();
      if (!reservada) return false;
      const [existing] = await tx.select().from(comprasTable)
        .where(eq(comprasTable.id, id)).for("update");
      if (!existing) throw new CompraRouteError("Compra no encontrada.", 404);
      let preciosRestaurados = true;
      let historialPrecioId: number | undefined;
      if (existing && existing.estado === "llegado" && existing.cantidadRecibida) {
        const resultadoRestauracion = await restaurarPreciosCompra(
          tx,
          existing,
          undefined,
          true,
        );
        preciosRestaurados = resultadoRestauracion.restaurado;
        historialPrecioId = resultadoRestauracion.historialPrecioId;
        await ajustarStockPorCompra(
          tx,
          operationId,
          existing.productoId,
          -toNum(existing.cantidadRecibida),
          "reversion_compra",
        );
      }
      await tx.delete(comprasTable).where(eq(comprasTable.id, id));
      if (!req.header("x-sync-apply")) {
        await tx.insert(eventosSincronizacionTable).values({
          operationId,
          entidad: "compra",
          entidadId: String(id),
          tipo: "eliminar",
          metodo: "DELETE",
          endpoint: `/compras/${id}`,
          payload: {},
          referenciasRespuesta: historialPrecioId === undefined
            ? []
            : [{
                campo: "_syncHistorialPrecioId",
                entidad: "historial_precios",
                valorLocal: String(historialPrecioId),
              }],
          origen: "local",
        });
      }
      return { preciosRestaurados, historialPrecioId };
    });
    if (!eliminado) { res.json({ ok: true, yaProcesado: true, recursoId: id }); return; }
    res.json({
      mensaje: eliminado.preciosRestaurados
        ? "Compra eliminada y stock revertido"
        : "Compra eliminada y stock revertido. No se restauraron los precios porque no hay una copia segura o el producto cambió de precio después de la llegada.",
      ...(eliminado.historialPrecioId === undefined
        ? {}
        : { _syncHistorialPrecioId: eliminado.historialPrecioId }),
    });
  } catch (err) {
    res.status(errorStatus(err)).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.patch("/:id/corregir", async (req, res) => {
  if (!validarBody(corregirCompraRequest, req.body, res)) return;
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = parseInt(req.params.id);
  const {
    cantidadRecibida,
    precioCompraRegistrado,
    precioVentaRegistrado,
    productoId,
    preciosInventarioAntesManual,
    preciosInventarioActualesEsperados,
  } = req.body;

  try {
    const resultado = await db.transaction(async (tx) => {
      const yaInicial = await operacionYaProcesada(tx, operationId);
      if (yaInicial) {
        return { yaProcesado: true as const, recursoId: yaInicial.recursoId };
      }
      const [existing] = await tx
        .select()
        .from(comprasTable)
        .where(eq(comprasTable.id, id))
        .for("update");
      if (!existing) {
        throw new CompraRouteError("Compra no encontrada.", 404);
      }
      const ya = await operacionYaProcesada(tx, operationId);
      if (ya) {
        return { yaProcesado: true as const, recursoId: ya.recursoId };
      }
      if (existing.estado !== "llegado") {
        throw new CompraRouteError(
          "Solo se puede corregir una compra que ya está marcada como llegada.",
          409,
        );
      }

      const cantidadNueva = parseNumeroColombia(cantidadRecibida);
      if (!Number.isFinite(cantidadNueva) || cantidadNueva <= 0) {
        throw new CompraRouteError(
          "La cantidad recibida corregida debe ser mayor que cero.",
          400,
        );
      }
      const cantidadVieja = toNum(existing.cantidadRecibida);
      const productoIdNuevo =
        productoId === undefined ? existing.productoId : Number(productoId);
      const cambiarProducto = productoIdNuevo !== existing.productoId;
      const localAnterior =
        existing.cantidadLocalRecibida === null
          ? cantidadVieja
          : toNum(existing.cantidadLocalRecibida);
      const bodegaAnterior =
        existing.cantidadBodegaRecibida === null
          ? 0
          : toNum(existing.cantidadBodegaRecibida);
      const distribucionAnterior =
        Math.abs(localAnterior + bodegaAnterior - cantidadVieja) <= 0.0001
          ? { local: localAnterior, bodega: bodegaAnterior }
          : { local: cantidadVieja, bodega: 0 };
      const proporcionLocal =
        cantidadVieja > 0 ? distribucionAnterior.local / cantidadVieja : 1;
      const cantidadLocalNueva =
        Math.round(cantidadNueva * proporcionLocal * 1000) / 1000;
      const cantidadBodegaNueva = cantidadNueva - cantidadLocalNueva;
      let productoDestino: typeof productosTable.$inferSelect | undefined;
      let historialPrecioId: number | undefined;

      if (cambiarProducto) {
        for (const productoIdBloquear of [
          existing.productoId,
          productoIdNuevo,
        ].sort((a, b) => a - b)) {
          const producto = await bloquearProducto(tx, productoIdBloquear);
          if (!producto) {
            throw new CompraRouteError(
              `Producto ${productoIdBloquear} no encontrado para corregir la compra.`,
              404,
            );
          }
          if (producto.id === productoIdNuevo) productoDestino = producto;
        }
        const preciosManuales =
          preciosInventarioAntesManual && preciosInventarioActualesEsperados
            ? {
                anteriores: {
                  precioCompra: parseNumeroColombia(
                    preciosInventarioAntesManual.precioCompra,
                  ),
                  precioVentaSinIva: parseNumeroColombia(
                    preciosInventarioAntesManual.precioVentaSinIva,
                  ),
                  precioVentaConIva: parseNumeroColombia(
                    preciosInventarioAntesManual.precioVentaConIva,
                  ),
                  tieneIva: preciosInventarioAntesManual.tieneIva,
                },
                actualesEsperados: {
                  precioCompra: parseNumeroColombia(
                    preciosInventarioActualesEsperados.precioCompra,
                  ),
                  precioVentaSinIva: parseNumeroColombia(
                    preciosInventarioActualesEsperados.precioVentaSinIva,
                  ),
                  precioVentaConIva: parseNumeroColombia(
                    preciosInventarioActualesEsperados.precioVentaConIva,
                  ),
                  tieneIva: preciosInventarioActualesEsperados.tieneIva,
                },
              }
            : undefined;
        const resultadoRestauracion = await restaurarPreciosCompra(
          tx,
          existing,
          preciosManuales,
        );
        historialPrecioId = resultadoRestauracion.historialPrecioId;
        await ajustarStockPorCompra(
          tx,
          operationId,
          existing.productoId,
          -cantidadVieja,
          "correccion_producto_compra",
        );
        await ajustarStockPorCompra(
          tx,
          operationId,
          productoIdNuevo,
          cantidadNueva,
          "correccion_producto_compra",
          { local: cantidadLocalNueva, bodega: cantidadBodegaNueva },
        );
      } else {
        const delta = cantidadNueva - cantidadVieja;
        if (delta !== 0) {
          await ajustarStockPorCompra(
            tx,
            operationId,
            existing.productoId,
            delta,
            "correccion_compra",
          );
        }
      }

      const datosActualizacion: Partial<typeof comprasTable.$inferInsert> = {
        productoId: productoIdNuevo,
        cantidadRecibida: String(cantidadNueva),
        cantidadLocalRecibida: String(cantidadLocalNueva),
        cantidadBodegaRecibida: String(cantidadBodegaNueva),
        precioCompraRegistrado:
          precioCompraRegistrado !== undefined
            ? String(parseNumeroColombia(precioCompraRegistrado))
            : existing.precioCompraRegistrado,
        precioVentaRegistrado:
          precioVentaRegistrado !== undefined
            ? String(parseNumeroColombia(precioVentaRegistrado))
            : existing.precioVentaRegistrado,
        actualizadoEn: new Date(),
      };
      if (cambiarProducto && productoDestino) {
        datosActualizacion.productoNombre = productoDestino.nombre;
        datosActualizacion.productoCodigo = productoDestino.codigo;
        datosActualizacion.productoMarca = productoDestino.marca;
        datosActualizacion.stockActual = productoDestino.stockActual;
        datosActualizacion.stockMinimo = productoDestino.stockMinimo;
        const preciosDestino = leerPreciosInventario(productoDestino);
        datosActualizacion.preciosInventarioAntes = preciosDestino;
        datosActualizacion.preciosInventarioAplicados = preciosDestino;
        datosActualizacion.preciosInventarioActualizados = false;
      }

      const [actualizada] = await tx.update(comprasTable)
        .set(datosActualizacion)
        .where(eq(comprasTable.id, id))
        .returning();

      if (!req.header("x-sync-apply")) {
        await tx.insert(eventosSincronizacionTable).values({
          operationId,
          entidad: "compra",
          entidadId: String(id),
          tipo: "corregir",
          metodo: "PATCH",
          endpoint: `/compras/${id}/corregir`,
          payload: req.body,
          referenciasRespuesta: historialPrecioId === undefined
            ? []
            : [{
                campo: "_syncHistorialPrecioId",
                entidad: "historial_precios",
                valorLocal: String(historialPrecioId),
              }],
          origen: "local",
        });
      }
      await tx.insert(operacionesSincronizadasTable).values({
        operationId,
        tipo: "compra",
        recursoId: id,
      }).onConflictDoNothing();
      return {
        yaProcesado: false as const,
        compra: actualizada,
        historialPrecioId,
      };
    });

    if (resultado.yaProcesado) {
      res.status(200).json({
        ok: true,
        yaProcesado: true,
        recursoId: resultado.recursoId,
      });
      return;
    }
    res.json({
      ...mapCompra(resultado.compra),
      ...(resultado.historialPrecioId === undefined
        ? {}
        : { _syncHistorialPrecioId: resultado.historialPrecioId }),
    });
  } catch (err) {
    res.status(errorStatus(err)).json({
      error: err instanceof Error ? err.message : String(err),
    });
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
