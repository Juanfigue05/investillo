import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { trabajadoresTable, pagosSeguroTable } from "@workspace/db/schema";
import { eq, sum } from "drizzle-orm";

const router: IRouter = Router();

function toNum(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return isNaN(n) ? 0 : n;
}

async function mapTrabajador(t: typeof trabajadoresTable.$inferSelect) {
  const [{ totalPagado }] = await db
    .select({ totalPagado: sum(pagosSeguroTable.monto) })
    .from(pagosSeguroTable)
    .where(eq(pagosSeguroTable.trabajadorId, t.id));

  const descontado = toNum(t.totalSeguroDescontado);
  const pagado = toNum(totalPagado);

  return {
    id: t.id,
    nombre: t.nombre,
    descuentoSeguro: toNum(t.descuentoSeguro),
    descuentoOtros: toNum(t.descuentoOtros),
    totalGanado: toNum(t.totalGanado),
    totalDescuentos: toNum(t.totalDescuentos),
    activo: t.activo,
    numeroSeguro: t.numeroSeguro,
    telefono: t.telefono,
    correo: t.correo,
    eps: t.eps,
    aplicaSeguro: t.aplicaSeguro,
    fechaProximoPagoSeguro: t.fechaProximoPagoSeguro,
    seguroTotalDescontado: descontado,
    seguroTotalPagado: pagado,
    seguroSaldoPendiente: Math.max(0, descontado - pagado),
    creadoEn: t.creadoEn,
  };
}

router.get("/", async (_req, res) => {
  const trabajadores = await db.select().from(trabajadoresTable).orderBy(trabajadoresTable.id);
  res.json(await Promise.all(trabajadores.map(mapTrabajador)));
});

router.post("/", async (req, res) => {
  const { nombre, descuentoSeguro, descuentoOtros, activo, numeroSeguro, telefono, correo, eps, aplicaSeguro } = req.body;

  const [trabajador] = await db.insert(trabajadoresTable).values({
    nombre,
    descuentoSeguro: String(parseFloat(descuentoSeguro || 0)),
    descuentoOtros: String(parseFloat(descuentoOtros || 0)),
    activo: activo !== undefined ? Boolean(activo) : true,
    numeroSeguro: numeroSeguro || null,
    telefono: telefono || null,
    correo: correo || null,
    eps: eps || null,
    aplicaSeguro: Boolean(aplicaSeguro),
  }).returning();

  res.status(201).json(await mapTrabajador(trabajador));
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { nombre, descuentoSeguro, descuentoOtros, activo, numeroSeguro, telefono, correo, eps, aplicaSeguro, fechaProximoPagoSeguro } = req.body;

  const [trabajador] = await db
    .update(trabajadoresTable)
    .set({
      nombre,
      descuentoSeguro: descuentoSeguro !== undefined ? String(parseFloat(descuentoSeguro)) : undefined,
      descuentoOtros: descuentoOtros !== undefined ? String(parseFloat(descuentoOtros)) : undefined,
      activo: activo !== undefined ? Boolean(activo) : undefined,
      numeroSeguro: numeroSeguro !== undefined ? (numeroSeguro || null) : undefined,
      telefono: telefono !== undefined ? (telefono || null) : undefined,
      correo: correo !== undefined ? (correo || null) : undefined,
      eps: eps !== undefined ? (eps || null) : undefined,
      aplicaSeguro: aplicaSeguro !== undefined ? Boolean(aplicaSeguro) : undefined,
      fechaProximoPagoSeguro: fechaProximoPagoSeguro !== undefined ? (fechaProximoPagoSeguro || null) : undefined,
    })
    .where(eq(trabajadoresTable.id, id))
    .returning();

  if (!trabajador) { res.status(404).json({ error: "Trabajador no encontrado" }); return; }
  res.json(await mapTrabajador(trabajador));
});

// ── Pagos de seguro ──────────────────────────────────────────────────────

router.get("/:id/pagos-seguro", async (req, res) => {
  const trabajadorId = parseInt(req.params.id);
  const pagos = await db
    .select()
    .from(pagosSeguroTable)
    .where(eq(pagosSeguroTable.trabajadorId, trabajadorId))
    .orderBy(pagosSeguroTable.fecha);
  res.json(pagos.map((p) => ({ id: p.id, fecha: p.fecha, monto: toNum(p.monto), creadoEn: p.creadoEn })));
});

router.post("/:id/pagos-seguro", async (req, res) => {
  const trabajadorId = parseInt(req.params.id);
  const { fecha, monto } = req.body;

  if (!fecha || !monto || toNum(monto) <= 0) {
    res.status(400).json({ error: "fecha y monto son requeridos" });
    return;
  }

  const [pago] = await db
    .insert(pagosSeguroTable)
    .values({ trabajadorId, fecha, monto: String(toNum(monto)) })
    .returning();

  res.status(201).json({ id: pago.id, fecha: pago.fecha, monto: toNum(pago.monto) });
});

router.delete("/:id/pagos-seguro/:pagoId", async (req, res) => {
  const pagoId = parseInt(req.params.pagoId);
  await db.delete(pagosSeguroTable).where(eq(pagosSeguroTable.id, pagoId));
  res.json({ ok: true });
});

export default router;