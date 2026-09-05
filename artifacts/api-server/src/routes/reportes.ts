import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { ventasDiariasTable } from "@workspace/db/schema";
import { gte, sql } from "drizzle-orm";
import { fechaColombia } from "../lib/fecha";

const router: IRouter = Router();

const FORMAS_PAGO = ["efectivo", "cuenta_ernesto", "cuenta_olga", "cuenta_juan"] as const;

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

  const filas = await pool.query(`
    SELECT d.trabajador_id, d.trabajador_nombre, mo.fecha,
           SUM(d.valor) AS valor,
           SUM(d.descuento_otros) AS descuento_otros,
           SUM(d.descuento_seguro) AS descuento_seguro
    FROM distribuciones_mano_obra d
    JOIN mano_obra mo ON mo.id = d.mano_obra_id
    WHERE mo.fecha BETWEEN $1 AND $2
    GROUP BY d.trabajador_id, d.trabajador_nombre, mo.fecha
    ORDER BY d.trabajador_nombre, mo.fecha
  `, [desde, hasta]);

  const porTrabajador = new Map<number, { trabajadorId: number; nombre: string; dias: Map<string, any> }>();
  for (const r of filas.rows) {
    if (!porTrabajador.has(r.trabajador_id)) {
      porTrabajador.set(r.trabajador_id, { trabajadorId: r.trabajador_id, nombre: r.trabajador_nombre, dias: new Map() });
    }
    const valor = parseFloat(r.valor);
    const descuentoOtros = parseFloat(r.descuento_otros);
    const seguro = parseFloat(r.descuento_seguro);
    porTrabajador.get(r.trabajador_id)!.dias.set(r.fecha.toISOString().slice(0, 10), {
      valor, descuentoOtros, seguro, total: valor - descuentoOtros - seguro,
    });
  }

  // Rellenar TODOS los días del mes, marcando los que no tienen registro
  const trabajadores = [...porTrabajador.values()].map((t) => {
    const dias = [];
    for (let d = 1; d <= ultimoDia; d++) {
      const fecha = `${mes}-${String(d).padStart(2, "0")}`;
      const registro = t.dias.get(fecha);
      dias.push(registro ? { fecha, ...registro } : { fecha, sinRegistro: true });
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

export default router;