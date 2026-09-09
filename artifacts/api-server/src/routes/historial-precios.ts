import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { eventosSincronizacionTable, historialPreciosTable, operacionesSincronizadasTable } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";

const router: IRouter = Router();

function toNum(v: unknown): number {
  return typeof v === "string" ? parseFloat(v) : Number(v);
}

function mapHistorial(h: typeof historialPreciosTable.$inferSelect) {
  return {
    id: h.id,
    productoId: h.productoId,
    productoNombre: h.productoNombre,
    productoCodigo: h.productoCodigo,
    precioCompra: toNum(h.precioCompra),
    precioVenta: toNum(h.precioVenta),
    fecha: h.fecha,
    origen: h.origen,
    compraId: h.compraId,
    proveedor: h.proveedor,
    actualizoPrecioInventario: h.actualizoPrecioInventario,
    creadoEn: h.creadoEn,
  };
}

router.get("/", async (req, res) => {
  const productoId = req.query.productoId ? parseInt(req.query.productoId as string) : undefined;
  const registros = productoId
    ? await db.select().from(historialPreciosTable).where(eq(historialPreciosTable.productoId, productoId)).orderBy(desc(historialPreciosTable.fecha))
    : await db.select().from(historialPreciosTable).orderBy(desc(historialPreciosTable.fecha));
  res.json(registros.map(mapHistorial));
});

router.delete("/:id", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = parseInt(req.params.id);
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  if (isNaN(id)) { res.status(400).json({ error: "id inválido" }); return; }
  await db.delete(historialPreciosTable).where(eq(historialPreciosTable.id, id));
  if (!req.header("x-sync-apply")) await db.insert(eventosSincronizacionTable).values({ operationId, entidad: "historial_precios", entidadId: String(id), tipo: "eliminar", metodo: "DELETE", endpoint: `/historial-precios/${id}`, payload: {}, origen: "local" });
  await db.insert(operacionesSincronizadasTable).values({ operationId, tipo: "historial_precios", recursoId: id }).onConflictDoNothing();
  res.json({ ok: true });
});

export default router;
