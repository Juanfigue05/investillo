import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { cierreDiarioTable, trabajadoresTable, ventasDiariasTable } from "@workspace/db/schema";
import { eq, gte, sql } from "drizzle-orm";
import { fechaColombia } from "../lib/fecha";

const router: IRouter = Router();

const FORMAS_PAGO = ["efectivo", "cuenta_ernesto", "cuenta_olga", "cuenta_juan"] as const;

function parseReportNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

router.get("/formas-pago", async (_req, res) => {
  const fechaLimite = new Date();
  fechaLimite.setMonth(fechaLimite.getMonth() - 6);
  const fechaLimiteStr = fechaColombia(fechaLimite);

  const rows = await db
    .select({
      fecha: ventasDiariasTable.fecha,
      formaPago: ventasDiariasTable.formaPago,
      total: sql<string>`SUM(${ventasDiariasTable.precioVentaTotal})`,
    })
    .from(ventasDiariasTable)
    .where(gte(ventasDiariasTable.fecha, fechaLimiteStr))
    .groupBy(ventasDiariasTable.fecha, ventasDiariasTable.formaPago);

  const porDiaMap = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const fp = r.formaPago || "efectivo";
    if (!porDiaMap.has(r.fecha)) porDiaMap.set(r.fecha, {});
    porDiaMap.get(r.fecha)![fp] = (porDiaMap.get(r.fecha)![fp] || 0) + parseFloat(r.total || "0");
  }

  const porDia = [...porDiaMap.entries()]
    .map(([fecha, montos]) => ({
      fecha,
      efectivo: montos.efectivo || 0,
      cuenta_ernesto: montos.cuenta_ernesto || 0,
      cuenta_olga: montos.cuenta_olga || 0,
      cuenta_juan: montos.cuenta_juan || 0,
      total: FORMAS_PAGO.reduce((s, f) => s + (montos[f] || 0), 0),
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  const porMesMap = new Map<string, { efectivo: number; cuenta_ernesto: number; cuenta_olga: number; cuenta_juan: number; total: number }>();
  for (const d of porDia) {
    const mes = d.fecha.slice(0, 7);
    if (!porMesMap.has(mes)) porMesMap.set(mes, { efectivo: 0, cuenta_ernesto: 0, cuenta_olga: 0, cuenta_juan: 0, total: 0 });
    const acc = porMesMap.get(mes)!;
    acc.efectivo += d.efectivo;
    acc.cuenta_ernesto += d.cuenta_ernesto;
    acc.cuenta_olga += d.cuenta_olga;
    acc.cuenta_juan += d.cuenta_juan;
    acc.total += d.total;
  }
  const porMes = [...porMesMap.entries()].map(([mes, montos]) => ({ mes, ...montos })).sort((a, b) => a.mes.localeCompare(b.mes));

  res.json({ porDia, porMes });
});

router.get("/nomina", async (req, res) => {
  const mes = String(req.query.mes || ""); // "2026-08"
  if (!/^\d{4}-\d{2}$/.test(mes)) { res.status(400).json({ error: "mes inválido, use YYYY-MM" }); return; }

  const desde = `${mes}-01`;
  const [anio, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(anio, m, 0).getDate();
  const hasta = `${mes}-${String(ultimoDia).padStart(2, "0")}`;

  const seleccionados = await db.select({ id: trabajadoresTable.id, nombre: trabajadoresTable.nombre })
    .from(trabajadoresTable)
    .where(sql`${trabajadoresTable.activo} = true AND ${trabajadoresTable.incluyeNomina} = true`);
  const cierres = await db.select({ id: cierreDiarioTable.id, fecha: cierreDiarioTable.fecha, datos: cierreDiarioTable.datos })
    .from(cierreDiarioTable)
    .where(sql`${cierreDiarioTable.fecha} >= ${desde} AND ${cierreDiarioTable.fecha} <= ${hasta}`);

  const porTrabajador = new Map<number, { trabajadorId: number; nombre: string; dias: Map<string, any> }>();
  for (const trabajador of seleccionados) {
    porTrabajador.set(trabajador.id, { trabajadorId: trabajador.id, nombre: trabajador.nombre, dias: new Map() });
  }
  for (const cierre of cierres) {
    const datos = Array.isArray(cierre.datos) ? cierre.datos : (cierre.datos as any)?.trabajadores;
    if (!Array.isArray(datos)) continue;
    for (const registro of datos) {
      const trabajadorId = Number(registro?.trabajadorId);
      const trabajador = porTrabajador.get(trabajadorId);
      if (!trabajador) continue;
      const calc = registro.calc || {};
      const valor = Number(calc.mo || 0);
      const descuentoOtros = Number(calc.descuento || 0);
      const seguro = Number(calc.seguro || 0);
      trabajador.dias.set(cierre.fecha, {
        cierreId: cierre.id,
        valor, descuentoOtros, seguro,
        total: Number(calc.total ?? valor - descuentoOtros - seguro),
      });
    }
  }

  const fechasConCierre = new Set(cierres.map((cierre) => cierre.fecha));

  // Rellenar TODOS los días del mes, marcando los que no tienen registro
  const trabajadores = [...porTrabajador.values()].map((t) => {
    const dias = [];
    for (let d = 1; d <= ultimoDia; d++) {
      const fecha = `${mes}-${String(d).padStart(2, "0")}`;
      const diaSemana = new Date(`${fecha}T12:00:00`).getDay();
      if (diaSemana === 0) continue;
      const registro = t.dias.get(fecha);
      dias.push(registro
        ? { fecha, ...registro }
        : fechasConCierre.has(fecha)
          ? { fecha, noVino: true }
          : { fecha, sinRegistro: true });
    }
    return { trabajadorId: t.trabajadorId, nombre: t.nombre, dias };
  });

  const tensionadas = await pool.query(
    `SELECT id, fecha, valor FROM tensionadas WHERE fecha BETWEEN $1 AND $2 ORDER BY fecha`,
    [desde, hasta],
  );
  const totalTensionadas = tensionadas.rows.reduce((s, t) => s + parseFloat(t.valor), 0);

  res.json({
    trabajadores,
    tensionadas: tensionadas.rows.map((t) => ({ id: t.id, fecha: t.fecha.toISOString().slice(0, 10), valor: parseFloat(t.valor) })),
    totalTensionadas,
  });
});

router.patch("/nomina/dia", async (req, res) => {
  const {
    fechaOriginal,
    fecha,
    trabajadorId,
    valor,
    descuentoOtros,
    seguro,
    total,
  } = req.body as {
    fechaOriginal?: string;
    fecha?: string;
    trabajadorId?: number;
    valor?: number;
    descuentoOtros?: number;
    seguro?: number;
    total?: number;
  };
  if (!fechaOriginal || !fecha || !trabajadorId) {
    res.status(400).json({ error: "fechaOriginal, fecha y trabajadorId son obligatorios" });
    return;
  }
  if (new Date(`${fecha}T12:00:00`).getDay() === 0) {
    res.status(400).json({ error: "Los domingos no se incluyen en nómina" });
    return;
  }
  const [cierre] = await db.select().from(cierreDiarioTable).where(eq(cierreDiarioTable.fecha, fechaOriginal)).limit(1);
  if (!cierre) { res.status(404).json({ error: "Cierre diario no encontrado" }); return; }
  const datos = Array.isArray(cierre.datos) ? cierre.datos : (cierre.datos as any)?.trabajadores;
  if (!Array.isArray(datos)) { res.status(400).json({ error: "Formato del cierre no reconocido" }); return; }
  const registro = datos.find((item: any) => Number(item?.trabajadorId) === Number(trabajadorId));
  if (!registro) { res.status(404).json({ error: "Trabajador no encontrado en ese cierre" }); return; }
  const seguroAnterior = parseReportNumber(registro.calc?.seguro);
  const nuevoValor = parseReportNumber(valor);
  const nuevoDescuento = parseReportNumber(descuentoOtros);
  const nuevoSeguro = parseReportNumber(seguro);
  registro.calc = {
    ...(registro.calc || {}),
    mo: nuevoValor,
    descuento: nuevoDescuento,
    seguro: nuevoSeguro,
    total: total === undefined ? nuevoValor - nuevoDescuento - nuevoSeguro : parseReportNumber(total),
  };
  const nuevoTotalPagar = datos.reduce((sum: number, item: any) => sum + parseReportNumber(item?.calc?.total), 0);
  try {
    const actualizado = await db.transaction(async (tx) => {
      const deltaSeguro = nuevoSeguro - seguroAnterior;
      if (deltaSeguro !== 0) {
        await tx.update(trabajadoresTable)
          .set({ totalSeguroDescontado: sql`${trabajadoresTable.totalSeguroDescontado} + ${deltaSeguro}` })
          .where(eq(trabajadoresTable.id, trabajadorId));
      }
      const [fila] = await tx.update(cierreDiarioTable)
        .set({ fecha, datos: Array.isArray(cierre.datos) ? datos : { ...(cierre.datos as any), trabajadores: datos }, totalPagar: Math.round(nuevoTotalPagar) })
        .where(eq(cierreDiarioTable.id, cierre.id))
        .returning({ id: cierreDiarioTable.id, fecha: cierreDiarioTable.fecha });
      return fila;
    });
    res.json(actualizado);
  } catch (error) {
    res.status(409).json({ error: `No se pudo actualizar el cierre: ${String(error)}` });
  }
});

export default router;