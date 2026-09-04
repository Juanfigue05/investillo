import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
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

export default router;