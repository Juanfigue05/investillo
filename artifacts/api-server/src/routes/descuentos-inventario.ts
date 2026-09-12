import { Router } from "express";
import { db } from "@workspace/db";
import { descuentosInventarioTable, eventosSincronizacionTable, operacionesSincronizadasTable, productosTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { parseNumeroColombia } from "@workspace/api-zod";

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
  if (cantidad < 0.25 || cantidad > 10 || Math.abs(cantidad * 4 - Math.round(cantidad * 4)) > 0.0001) {
    throw new Error(`La cantidad de ${nombre} debe estar entre 0,25 y 10, en pasos de 0,25`);
  }
}

function distribuir(cantidad: number, local: number, bodega: number) {
  if (local + bodega + 0.0001 < cantidad) throw new Error("No hay existencias suficientes");
  const cantidadLocal = Math.min(local, cantidad);
  return { cantidadLocal, cantidadBodega: cantidad - cantidadLocal };
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
  if (new Set(ids).size !== ids.length) { res.status(400).json({ error: "No repitas productos en la misma operación" }); return; }

  try {
    const resultado = await db.transaction(async (tx) => {
      const productos = await tx.select().from(productosTable).where(inArray(productosTable.id, ids));
      const porId = new Map(productos.map((producto) => [producto.id, producto]));
      const registros: Array<typeof descuentosInventarioTable.$inferInsert> = [];

      for (const item of items) {
        const producto = porId.get(Number(item.productoId));
        const cantidad = numeroEntrada(item.cantidad);
        if (!producto) throw new Error("Producto no encontrado");
        validarCantidad(cantidad, producto.nombre);
        const localDisponible = numeroGuardado(producto.stockLocal);
        const bodegaDisponible = numeroGuardado(producto.stockBodega);
        const { cantidadLocal, cantidadBodega } = distribuir(cantidad, localDisponible, bodegaDisponible);
        await tx.update(productosTable).set({
          stockLocal: String(localDisponible - cantidadLocal),
          stockBodega: String(bodegaDisponible - cantidadBodega),
          stockActual: String(numeroGuardado(producto.stockActual) - cantidad),
          actualizadoEn: new Date(),
        }).where(eq(productosTable.id, producto.id));
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
      if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "descuento_inventario", entidadId: operationId, tipo: "crear", metodo: "POST", endpoint: "/descuentos-inventario", payload: req.body, origen: "local" });
      await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "descuento_inventario", recursoId: creados[0].id }).onConflictDoNothing();
      return creados;
    });
    res.status(201).json(resultado.map(mapRegistro));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const { cantidad: cantidadRaw, motivo, motivoOtro, observacion } = req.body as { cantidad?: string | number; motivo?: string; motivoOtro?: string; observacion?: string };
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
  if (!MOTIVOS.includes(motivo as typeof MOTIVOS[number])) { res.status(400).json({ error: "Selecciona un motivo válido" }); return; }
  if (motivo === "Otro" && !motivoOtro?.trim()) { res.status(400).json({ error: "Especifica el motivo" }); return; }
  try {
    const actualizado = await db.transaction(async (tx) => {
      const [registro] = await tx.select().from(descuentosInventarioTable).where(eq(descuentosInventarioTable.id, id));
      if (!registro) throw new Error("Descuento no encontrado");
      const [producto] = await tx.select().from(productosTable).where(eq(productosTable.id, registro.productoId));
      if (!producto) throw new Error("Producto no encontrado");
      const cantidad = numeroEntrada(cantidadRaw);
      validarCantidad(cantidad, producto.nombre);
      const localRestaurado = numeroGuardado(producto.stockLocal) + numeroGuardado(registro.cantidadLocal);
      const bodegaRestaurado = numeroGuardado(producto.stockBodega) + numeroGuardado(registro.cantidadBodega);
      const { cantidadLocal, cantidadBodega } = distribuir(cantidad, localRestaurado, bodegaRestaurado);
      const [resultado] = await tx.update(descuentosInventarioTable).set({
        cantidad: String(cantidad), cantidadLocal: String(cantidadLocal), cantidadBodega: String(cantidadBodega),
        motivo: motivo as typeof MOTIVOS[number], motivoOtro: motivo === "Otro" ? motivoOtro!.trim() : null, observacion: observacion?.trim() || null,
      }).where(eq(descuentosInventarioTable.id, id)).returning();
      await tx.update(productosTable).set({
        stockLocal: String(localRestaurado - cantidadLocal), stockBodega: String(bodegaRestaurado - cantidadBodega),
        stockActual: String(numeroGuardado(producto.stockActual) + numeroGuardado(registro.cantidad) - cantidad), actualizadoEn: new Date(),
      }).where(eq(productosTable.id, producto.id));
      if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "descuento_inventario", entidadId: String(id), tipo: "actualizar", metodo: "PUT", endpoint: `/descuentos-inventario/${id}`, payload: req.body, origen: "local" });
      return resultado;
    });
    res.json(mapRegistro(actualizado));
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
  try {
    await db.transaction(async (tx) => {
      const [registro] = await tx.select().from(descuentosInventarioTable).where(eq(descuentosInventarioTable.id, id));
      if (!registro) throw new Error("Descuento no encontrado");
      const [producto] = await tx.select().from(productosTable).where(eq(productosTable.id, registro.productoId));
      if (!producto) throw new Error("Producto no encontrado");
      await tx.update(productosTable).set({
        stockLocal: String(numeroGuardado(producto.stockLocal) + numeroGuardado(registro.cantidadLocal)), stockBodega: String(numeroGuardado(producto.stockBodega) + numeroGuardado(registro.cantidadBodega)),
        stockActual: String(numeroGuardado(producto.stockActual) + numeroGuardado(registro.cantidad)), actualizadoEn: new Date(),
      }).where(eq(productosTable.id, producto.id));
      await tx.delete(descuentosInventarioTable).where(eq(descuentosInventarioTable.id, id));
      if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "descuento_inventario", entidadId: String(id), tipo: "eliminar", metodo: "DELETE", endpoint: `/descuentos-inventario/${id}`, payload: {}, origen: "local" });
    });
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

export default router;