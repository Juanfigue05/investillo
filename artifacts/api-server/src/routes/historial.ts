import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { eventosSincronizacionTable, historialDiasTable, operacionesSincronizadasTable, ventasDiariasTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { operacionYaProcesada } from "./lib/operacion-sincronizada";

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
    orden: v.orden,
    descripcion: v.descripcion,
    creadoEn: v.creadoEn,
  };
}

async function mapHistorial(dia: typeof historialDiasTable.$inferSelect) {
  const ventas = await db
    .select()
    .from(ventasDiariasTable)
    .where(eq(ventasDiariasTable.fecha, dia.fecha));
  ventas.sort((a, b) => {
    if (a.orden != null || b.orden != null) {
      if (a.orden == null) return 1;
      if (b.orden == null) return -1;
      if (a.orden !== b.orden) return a.orden - b.orden;
    }
    const aCreado = a.creadoEn ? new Date(a.creadoEn).getTime() : 0;
    const bCreado = b.creadoEn ? new Date(b.creadoEn).getTime() : 0;
    if (aCreado !== bCreado) return aCreado - bCreado;
    return a.id - b.id;
  });
  return {
    id: dia.id,
    fecha: dia.fecha,
    notas: dia.notas,
    guardadoEn: dia.guardadoEn,
    ventas: ventas.map(mapVenta),
  };
}

// GET /historial — all saved days newest first
router.get("/", async (_req, res) => {
  const dias = await db
    .select()
    .from(historialDiasTable)
    .orderBy(historialDiasTable.fecha);
  const result = await Promise.all(dias.map(mapHistorial));
  res.json(result.reverse());
});

// POST /historial — save a day (fecha must be unique)
router.post("/", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const { fecha, notas } = req.body as { fecha: string; notas?: string };
  try {
    const resultado = await db.transaction(async (tx) => {
      const ya = await operacionYaProcesada(tx, operationId);
      if (ya) return { yaProcesado: ya } as const;
      if (!fecha) return { error: "La fecha es obligatoria" } as const;
      const [dia] = await tx
        .insert(historialDiasTable)
        .values({ fecha, notas: notas || null })
        .returning();
      if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "historial", entidadId: String(dia.id), tipo: "crear", metodo: "POST", endpoint: "/historial", payload: req.body, origen: "local" });
      await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "historial", recursoId: dia.id }).onConflictDoNothing();
      return { dia } as const;
    });
    if (resultado.yaProcesado) {
      res.status(200).json({ ok: true, yaProcesado: true, recursoId: resultado.yaProcesado.recursoId });
      return;
    }
    if ("error" in resultado) { res.status(400).json({ error: resultado.error }); return; }
    res.status(201).json(await mapHistorial(resultado.dia));
  } catch {
    // Unique constraint violation = already saved
    const existing = await db
      .select()
      .from(historialDiasTable)
      .where(eq(historialDiasTable.fecha, fecha));
    if (existing.length) {
      res.status(409).json({ error: "Este día ya está guardado en el historial", id: existing[0].id });
    } else {
      res.status(500).json({ error: "Error al guardar el día" });
    }
  }
});

// PUT /historial/:id — update notas only, fecha is immutable
router.put("/:id", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = parseInt(req.params.id);
  const { notas } = req.body as { notas?: string | null };
  const resultado = await db.transaction(async (tx) => {
    const ya = await operacionYaProcesada(tx, operationId);
    if (ya) return { yaProcesado: ya } as const;
    const [dia] = await tx
      .update(historialDiasTable)
      .set({ notas: notas ?? null })
      .where(eq(historialDiasTable.id, id))
      .returning();
    if (!dia) return { noEncontrado: true } as const;
    if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "historial", entidadId: String(id), tipo: "actualizar", metodo: "PUT", endpoint: `/historial/${id}`, payload: req.body, origen: "local" });
    await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "historial", recursoId: id }).onConflictDoNothing();
    return { dia } as const;
  });
  if (resultado.yaProcesado) {
    res.status(200).json({ ok: true, yaProcesado: true, recursoId: resultado.yaProcesado.recursoId });
    return;
  }
  if ("noEncontrado" in resultado) { res.status(404).json({ error: "Día no encontrado" }); return; }
  res.json(await mapHistorial(resultado.dia));
});

// DELETE /historial/:id — remove from historial only, ventas stay
router.delete("/:id", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = parseInt(req.params.id);
  const resultado = await db.transaction(async (tx) => {
    const ya = await operacionYaProcesada(tx, operationId);
    if (ya) return { yaProcesado: ya } as const;
    await tx.delete(historialDiasTable).where(eq(historialDiasTable.id, id));
    if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "historial", entidadId: String(id), tipo: "eliminar", metodo: "DELETE", endpoint: `/historial/${id}`, payload: {}, origen: "local" });
    await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "historial", recursoId: id }).onConflictDoNothing();
    return { eliminado: true } as const;
  });
  if (resultado.yaProcesado) {
    res.status(200).json({ ok: true, yaProcesado: true, recursoId: resultado.yaProcesado.recursoId });
    return;
  }
  res.json({ mensaje: "Eliminado del historial" });
});

export default router;
