import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ventasDiariasTable, creditosTable, productosTable, comprasTable } from "@workspace/db/schema";
import { eq, lte, sql, and, gte } from "drizzle-orm";
import { fechaHoyColombia } from "../lib/fecha";
import { obtenerRangoMesCreditos, resumirCreditosMes } from "../lib/dashboard-analisis";
const router: IRouter = Router();

function toNum(v: unknown): number {
  return typeof v === "string" ? parseFloat(v) : Number(v);
}

router.get("/analisis", async (req, res) => {
  const mes = String(req.query.mes || "");
  const rango = obtenerRangoMesCreditos(mes);
  if (!rango) {
    res.status(400).json({ error: "El mes debe tener formato YYYY-MM válido" });
    return;
  }

  const creditos = await db.select({
    valorCredito: creditosTable.valorCredito,
    valorAbonado: creditosTable.valorAbonado,
  }).from(creditosTable).where(and(
    eq(creditosTable.tipo, "credito"),
    gte(creditosTable.fechaFactura, rango.desde),
    lte(creditosTable.fechaFactura, rango.hasta),
  ));

  res.json(resumirCreditosMes(creditos));
});

router.get("/", async (req, res) => {
  const hoy = fechaHoyColombia();

  const [ventasHoy, creditosRows, noDebeRows, productosAlerta, productosAgotados, comprasLlegadas] = await Promise.all([
    db.select().from(ventasDiariasTable).where(eq(ventasDiariasTable.fecha, hoy)),
    db.select().from(creditosTable).where(eq(creditosTable.tipo, "credito")),
    db.select().from(creditosTable).where(eq(creditosTable.tipo, "nosdebe")),
    db.select().from(productosTable).where(lte(productosTable.stockActual, sql`${productosTable.stockMinimo} + 1`)),
    db.select().from(productosTable).where(lte(productosTable.stockActual, productosTable.stockMinimo)),
    db.select().from(comprasTable).where(eq(comprasTable.estado, "llegado")),
  ]);

  const totalVentasHoy = ventasHoy
    .filter(v => v.tipoLinea === "venta")
    .reduce((acc, v) => acc + toNum(v.precioVentaTotal), 0);

  let noDeben = 0;
  let cantidadCreditos = 0;
  for (const c of creditosRows) {
    const restante = toNum(c.valorCredito) - toNum(c.valorAbonado);
    if (restante > 0) { noDeben += restante; cantidadCreditos++; }
  }

  let totalNosDebe = 0;
  let cantidadNosDebe = 0;
  for (const c of noDebeRows) {
    const restante = toNum(c.valorCredito) - toNum(c.valorAbonado);
    if (restante > 0) { totalNosDebe += restante; cantidadNosDebe++; }
  }

  const totalComprasRecibidas = comprasLlegadas.reduce((acc, c) => {
    const cant = toNum(c.cantidadRecibida ?? "0");
    const precio = toNum(c.precioCompraRegistrado ?? "0");
    return acc + cant * precio;
  }, 0);

  res.json({
    totalVentasHoy,
    noDeben,
    cantidadCreditos,
    totalNosDebe,
    cantidadNosDebe,
    totalComprasRecibidas,
    productosAlerta: productosAlerta.length,
    productosAgotados: productosAgotados.length,
    ventasHoy: ventasHoy.filter(v => v.tipoLinea === "venta").length,
  });
});

export default router;
