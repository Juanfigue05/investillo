import { Router } from "express";
import { db } from "@workspace/db";
import { obraElectronicaTable, trabajadoresTable } from "@workspace/db/schema";
import { and, asc, eq, gte, lt } from "drizzle-orm";

const router = Router();

function parseValor(raw: unknown): number {
  const texto = String(raw ?? "").trim().replace(/\s/g, "").replace(",", ".");
  const numero = Number(texto);
  if (!Number.isFinite(numero) || numero < 0) return 0;
  return Math.round((numero < 1000 ? numero * 1000 : numero) * 100) / 100;
}

function inicioFinMes(mes: string) {
  if (!/^\d{4}-\d{2}$/.test(mes)) return null;
  const [anio, numeroMes] = mes.split("-").map(Number);
  const siguienteMes = new Date(anio, numeroMes, 1);
  const siguiente = `${siguienteMes.getFullYear()}-${String(siguienteMes.getMonth() + 1).padStart(2, "0")}-01`;
  return { desde: `${mes}-01`, siguiente };
}

function mapRegistro(registro: typeof obraElectronicaTable.$inferSelect) {
  return {
    id: registro.id,
    trabajadorId: registro.trabajadorId,
    empleadoNombre: registro.empleadoNombre,
    fecha: registro.fecha,
    numeroFactura: registro.numeroFactura,
    vehiculo: registro.vehiculo,
    valor: Number(registro.valor),
    creadoEn: registro.creadoEn,
  };
}

router.get("/", async (req, res) => {
  const mes = String(req.query.mes || "");
  const rango = inicioFinMes(mes);
  if (!rango) { res.status(400).json({ error: "El mes debe tener formato YYYY-MM" }); return; }
  const registros = await db.select().from(obraElectronicaTable)
    .where(and(gte(obraElectronicaTable.fecha, rango.desde), lt(obraElectronicaTable.fecha, rango.siguiente)))
    .orderBy(asc(obraElectronicaTable.fecha), asc(obraElectronicaTable.id));
  res.json(registros.map(mapRegistro));
});

router.post("/", async (req, res) => {
  const { trabajadorId, fecha, numeroFactura, vehiculo } = req.body;
  const id = Number(trabajadorId);
  if (!Number.isInteger(id) || !fecha) { res.status(400).json({ error: "Empleado y fecha son obligatorios" }); return; }
  const valor = parseValor(req.body.valor);
  if (valor <= 0) { res.status(400).json({ error: "El valor debe ser mayor que cero" }); return; }
  const [trabajador] = await db.select({ id: trabajadoresTable.id, nombre: trabajadoresTable.nombre, obraElectronica: trabajadoresTable.obraElectronica })
    .from(trabajadoresTable).where(eq(trabajadoresTable.id, id)).limit(1);
  if (!trabajador) { res.status(404).json({ error: "Empleado no encontrado" }); return; }
  if (!trabajador.obraElectronica) { res.status(403).json({ error: "Este empleado no tiene habilitada la obra electrónica" }); return; }
  const [registro] = await db.insert(obraElectronicaTable).values({
    trabajadorId: trabajador.id,
    empleadoNombre: trabajador.nombre,
    fecha,
    numeroFactura: String(numeroFactura || "").trim(),
    vehiculo: String(vehiculo || "").trim(),
    valor: String(valor),
  }).returning();
  res.status(201).json(mapRegistro(registro));
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const valor = parseValor(req.body.valor);
  if (!Number.isInteger(id) || !req.body.fecha || valor <= 0) { res.status(400).json({ error: "Fecha y valor válido son obligatorios" }); return; }
  const [registro] = await db.update(obraElectronicaTable).set({
    fecha: req.body.fecha,
    numeroFactura: String(req.body.numeroFactura || "").trim(),
    vehiculo: String(req.body.vehiculo || "").trim(),
    valor: String(valor),
  }).where(eq(obraElectronicaTable.id, id)).returning();
  if (!registro) { res.status(404).json({ error: "Registro no encontrado" }); return; }
  res.json(mapRegistro(registro));
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [registro] = await db.delete(obraElectronicaTable).where(eq(obraElectronicaTable.id, id)).returning({ id: obraElectronicaTable.id });
  if (!registro) { res.status(404).json({ error: "Registro no encontrado" }); return; }
  res.json({ ok: true });
});

export default router;
