import { Router } from "express";
import { db } from "@workspace/db";
import { descuentosInventarioTable, eventosSincronizacionTable, operacionesSincronizadasTable, productosTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { parseNumeroColombia } from "@workspace/api-zod";

const router = Router();
const MOTIVOS = ["Producto dañado", "Arreglo para trabajador", "Pérdida", "Consumo interno", "Producto vencido", "Otro"] as const;

function numero(v: unknown) { return parseNumeroColombia(v); }
function mapRegistro(row: typeof descuentosInventarioTable.$inferSelect) {
  return {
    ...row,
    cantidad: numero(row.cantidad),
    cantidadLocal: numero(row.cantidadLocal),
    cantidadBodega: numero(row.cantidadBodega),
    precioCompra: numero(row.precioCompra),
    precioVenta: numero(row.precioVenta),
  };
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
        const cantidad = numero(item.cantidad);
        if (!producto) throw new Error("Producto no encontrado");
        if (cantidad < 0.25 || cantidad > 10 || Math.abs(cantidad * 4 - Math.round(cantidad * 4)) > 0.0001) {
          throw new Error(`La cantidad de ${producto.nombre} debe estar entre 0,25 y 10, en pasos de 0,25`);
        }
        const localDisponible = numero(producto.stockLocal);
        const bodegaDisponible = numero(producto.stockBodega);
        if (localDisponible + bodegaDisponible + 0.0001 < cantidad) throw new Error(`No hay existencias suficientes de ${producto.nombre}`);
        const cantidadLocal = Math.min(localDisponible, cantidad);
        const cantidadBodega = cantidad - cantidadLocal;
        await tx.update(productosTable).set({
          stockLocal: String(localDisponible - cantidadLocal),
          stockBodega: String(bodegaDisponible - cantidadBodega),
          stockActual: String(numero(producto.stockActual) - cantidad),
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
          precioCompra: String(numero(producto.precioCompra)),
          precioVenta: String(numero(producto.precioVentaSinIva)),
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

export default router;