import { Router } from "express";
import { db } from "@workspace/db";
import { descuentosInventarioTable, eventosSincronizacionTable, movimientosInventarioTable, operacionesSincronizadasTable, productosTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { parseNumeroColombia } from "@workspace/api-zod";
import {
  bloquearProducto,
  guardarExistencias,
  leerExistencias,
  validarExistenciasNoNegativas,
  type Existencias,
  type InventarioTransaction,
} from "../lib/inventario-stock";

const router = Router();
const MOTIVOS = ["Producto dañado", "Arreglo para trabajador", "Pérdida", "Consumo interno", "Producto vencido", "Otro"] as const;

function numeroEntrada(v: unknown) { return parseNumeroColombia(v); }
function numeroGuardado(v: unknown) { return typeof v === "string" ? Number(v) : Number(v); }
function mapRegistro(row: typeof descuentosInventarioTable.$inferSelect) {
  return {
    ...row,
    cantidad: numeroGuardado(row.cantidad),
    cantidadLocal: numeroGuardado(row.cantidadLocal),
    cantidadBodega: numeroGuardado(row.cantidadBodega),
    precioCompra: numeroGuardado(row.precioCompra),
    precioVenta: numeroGuardado(row.precioVenta),
  };
}

function validarCantidad(cantidad: number, nombre: string) {
  if (!Number.isFinite(cantidad) || cantidad < 0.25 || cantidad > 10 || Math.abs(cantidad * 4 - Math.round(cantidad * 4)) > 0.0001) {
    throw new Error(`La cantidad de ${nombre} debe estar entre 0,25 y 10, en pasos de 0,25`);
  }
}

function distribuir(cantidad: number, local: number, bodega: number) {
  if (local + bodega + 0.0001 < cantidad) throw new Error("No hay existencias suficientes");
  const cantidadLocal = Math.min(local, cantidad);
  return { cantidadLocal, cantidadBodega: cantidad - cantidadLocal };
}

async function registrarCambioStock(
  tx: InventarioTransaction,
  operationId: string,
  producto: typeof productosTable.$inferSelect,
  antes: Existencias,
  localDespues: number,
  bodegaDespues: number,
  motivo: string,
  observacion: string,
) {
  let localAhora = antes.local;
  let bodegaAhora = antes.bodega;
  for (const [ubicacion, nuevoValor] of [
    ["local", localDespues],
    ["bodega", bodegaDespues],
  ] as const) {
    const anterior = ubicacion === "local" ? localAhora : bodegaAhora;
    const diferencia = nuevoValor - anterior;
    if (diferencia === 0) continue;
    const localNuevo = ubicacion === "local" ? nuevoValor : localAhora;
    const bodegaNuevo = ubicacion === "bodega" ? nuevoValor : bodegaAhora;
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
      stockLocalAntes: String(localAhora),
      stockLocalDespues: String(localNuevo),
      stockBodegaAntes: String(bodegaAhora),
      stockBodegaDespues: String(bodegaNuevo),
      stockActualAntes: String(localAhora + bodegaAhora),
      stockActualDespues: String(localNuevo + bodegaNuevo),
      observacion,
    });
    localAhora = localNuevo;
    bodegaAhora = bodegaNuevo;
  }
}

router.get("/", async (_req, res) => {
  const rows = await db.select().from(descuentosInventarioTable).orderBy(descuentosInventarioTable.creadoEn);
  res.json(rows.map(mapRegistro));
});

router.post("/", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const { motivo, motivoOtro, observacion, items } = req.body as {
    motivo?: string;
    motivoOtro?: string;
    observacion?: string;
    items?: Array<{ productoId: number; cantidad: string | number }>;
  };
  if (!MOTIVOS.includes(motivo as typeof MOTIVOS[number])) { res.status(400).json({ error: "Selecciona un motivo válido" }); return; }
  if (motivo === "Otro" && !motivoOtro?.trim()) { res.status(400).json({ error: "Especifica el motivo" }); return; }
  if (!Array.isArray(items) || items.length === 0) { res.status(400).json({ error: "Selecciona al menos un producto" }); return; }
  const motivoSeguro = motivo as typeof MOTIVOS[number];
  const ids = items.map((item) => Number(item.productoId));
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) { res.status(400).json({ error: "Producto no válido" }); return; }
  if (new Set(ids).size !== ids.length) { res.status(400).json({ error: "No repitas productos en la misma operación" }); return; }

  try {
    const resultado = await db.transaction(async (tx) => {
      const [reservada] = await tx
        .insert(operacionesSincronizadasTable)
        .values({
          operationId,
          tipo: "descuento_inventario",
          recursoId: Number(items[0].productoId),
        })
        .onConflictDoNothing()
        .returning();
      if (!reservada) return null;

      const registros: Array<typeof descuentosInventarioTable.$inferInsert> = [];

      for (const item of [...items].sort((a, b) => Number(a.productoId) - Number(b.productoId))) {
        const producto = await bloquearProducto(tx, Number(item.productoId));
        const cantidad = numeroEntrada(item.cantidad);
        if (!producto) throw new Error("Producto no encontrado");
        validarCantidad(cantidad, producto.nombre);
        const antes = leerExistencias(producto);
        validarExistenciasNoNegativas(antes);
        const { cantidadLocal, cantidadBodega } = distribuir(cantidad, antes.local, antes.bodega);
        const localDespues = antes.local - cantidadLocal;
        const bodegaDespues = antes.bodega - cantidadBodega;
        await guardarExistencias(tx, producto.id, localDespues, bodegaDespues);
        let localAntes = antes.local;
        let bodegaAntes = antes.bodega;
        for (const [ubicacion, cantidadSalida] of [
          ["local", cantidadLocal],
          ["bodega", cantidadBodega],
        ] as const) {
          if (cantidadSalida === 0) continue;
          const localNuevo = ubicacion === "local" ? localAntes - cantidadSalida : localAntes;
          const bodegaNuevo = ubicacion === "bodega" ? bodegaAntes - cantidadSalida : bodegaAntes;
          await tx.insert(movimientosInventarioTable).values({
            operationId,
            productoId: producto.id,
            productoNombre: producto.nombre,
            productoCodigo: producto.codigo,
            tipo: "salida",
            motivo: motivoSeguro,
            ubicacion,
            direccion: "restar",
            cantidad: String(cantidadSalida),
            stockLocalAntes: String(localAntes),
            stockLocalDespues: String(localNuevo),
            stockBodegaAntes: String(bodegaAntes),
            stockBodegaDespues: String(bodegaNuevo),
            stockActualAntes: String(localAntes + bodegaAntes),
            stockActualDespues: String(localNuevo + bodegaNuevo),
            observacion: [motivoSeguro === "Otro" ? motivoOtro?.trim() : null, observacion?.trim()]
              .filter(Boolean)
              .join(" — ") || null,
          });
          localAntes = localNuevo;
          bodegaAntes = bodegaNuevo;
        }
        registros.push({
          operacionId: operationId,
          motivo: motivoSeguro,
          motivoOtro: motivoSeguro === "Otro" ? motivoOtro!.trim() : null,
          observacion: observacion?.trim() || null,
          productoId: producto.id,
          productoNombre: producto.nombre,
          productoCodigo: producto.codigo,
          cantidad: String(cantidad),
          cantidadLocal: String(cantidadLocal),
          cantidadBodega: String(cantidadBodega),
          precioCompra: String(numeroGuardado(producto.precioCompra)),
          precioVenta: String(numeroGuardado(producto.precioVentaSinIva)),
        });
      }
      const creados = await tx.insert(descuentosInventarioTable).values(registros).returning();
      if (!req.header("x-sync-apply")) {
        await tx.insert(eventosSincronizacionTable).values({
          operationId,
          entidad: "descuento_inventario",
          entidadId: operationId,
          tipo: "crear",
          metodo: "POST",
          endpoint: "/descuentos-inventario",
          payload: req.body,
          referenciasRespuesta: creados.map((descuento, index) => ({
            campo: `${index}.id`,
            entidad: "descuento_inventario",
            valorLocal: String(descuento.id),
          })),
          origen: "local",
        });
      }
      return creados;
    });
    if (!resultado) {
      res.json({ ok: true, yaProcesado: true });
      return;
    }
    res.status(201).json(resultado.map(mapRegistro));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const { cantidad: cantidadRaw, motivo, motivoOtro, observacion } = req.body as { cantidad?: string | number; motivo?: string; motivoOtro?: string; observacion?: string };
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "id inválido" }); return; }
  if (!MOTIVOS.includes(motivo as typeof MOTIVOS[number])) { res.status(400).json({ error: "Selecciona un motivo válido" }); return; }
  if (motivo === "Otro" && !motivoOtro?.trim()) { res.status(400).json({ error: "Especifica el motivo" }); return; }
  try {
    const actualizado = await db.transaction(async (tx) => {
      const [reservada] = await tx.insert(operacionesSincronizadasTable)
        .values({ operationId, tipo: "descuento_inventario", recursoId: id })
        .onConflictDoNothing()
        .returning();
      if (!reservada) return null;
      const [registro] = await tx.select().from(descuentosInventarioTable)
        .where(eq(descuentosInventarioTable.id, id)).for("update");
      if (!registro) throw new Error("Descuento no encontrado");
      const producto = await bloquearProducto(tx, registro.productoId);
      if (!producto) throw new Error("Producto no encontrado");
      const antes = leerExistencias(producto);
      validarExistenciasNoNegativas(antes);
      const cantidad = numeroEntrada(cantidadRaw);
      validarCantidad(cantidad, producto.nombre);
      const localRestaurado = antes.local + numeroGuardado(registro.cantidadLocal);
      const bodegaRestaurado = antes.bodega + numeroGuardado(registro.cantidadBodega);
      const { cantidadLocal, cantidadBodega } = distribuir(cantidad, localRestaurado, bodegaRestaurado);
      const localDespues = localRestaurado - cantidadLocal;
      const bodegaDespues = bodegaRestaurado - cantidadBodega;
      const [resultado] = await tx.update(descuentosInventarioTable).set({
        cantidad: String(cantidad), cantidadLocal: String(cantidadLocal), cantidadBodega: String(cantidadBodega),
        motivo: motivo as typeof MOTIVOS[number], motivoOtro: motivo === "Otro" ? motivoOtro!.trim() : null, observacion: observacion?.trim() || null,
      }).where(eq(descuentosInventarioTable.id, id)).returning();
      await guardarExistencias(tx, producto.id, localDespues, bodegaDespues);
      await registrarCambioStock(tx, operationId, producto, antes, localDespues, bodegaDespues, "correccion_descuento", observacion?.trim() || "Corrección de descuento registrado");
      if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "descuento_inventario", entidadId: String(id), tipo: "actualizar", metodo: "PUT", endpoint: `/descuentos-inventario/${id}`, payload: req.body, origen: "local" });
      return resultado;
    });
    if (!actualizado) { res.json({ ok: true, yaProcesado: true, recursoId: id }); return; }
    res.json(mapRegistro(actualizado));
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "id inválido" }); return; }
  try {
    const eliminado = await db.transaction(async (tx) => {
      const [reservada] = await tx.insert(operacionesSincronizadasTable)
        .values({ operationId, tipo: "descuento_inventario", recursoId: id })
        .onConflictDoNothing()
        .returning();
      if (!reservada) return false;
      const [registro] = await tx.select().from(descuentosInventarioTable)
        .where(eq(descuentosInventarioTable.id, id)).for("update");
      if (!registro) throw new Error("Descuento no encontrado");
      const producto = await bloquearProducto(tx, registro.productoId);
      if (!producto) throw new Error("Producto no encontrado");
      const antes = leerExistencias(producto);
      validarExistenciasNoNegativas(antes);
      const localDespues = antes.local + numeroGuardado(registro.cantidadLocal);
      const bodegaDespues = antes.bodega + numeroGuardado(registro.cantidadBodega);
      await guardarExistencias(tx, producto.id, localDespues, bodegaDespues);
      await registrarCambioStock(tx, operationId, producto, antes, localDespues, bodegaDespues, "reversion_descuento", "Reversión de descuento registrado");
      await tx.delete(descuentosInventarioTable).where(eq(descuentosInventarioTable.id, id));
      if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "descuento_inventario", entidadId: String(id), tipo: "eliminar", metodo: "DELETE", endpoint: `/descuentos-inventario/${id}`, payload: {}, origen: "local" });
      return true;
    });
    if (!eliminado) { res.json({ ok: true, yaProcesado: true, recursoId: id }); return; }
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

export default router;