import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ventasDiariasTable, creditosTable, productosTable, comprasTable } from "@workspace/db/schema";
import { eq, lte, sql, and } from "drizzle-orm";

const router: IRouter = Router();

function toNum(v: unknown): number {
  return typeof v === "string" ? parseFloat(v) : Number(v);
}

router.get("/", async (req, res) => {
  const today = new Date().toISOString().split("T")[0];

  const [ventasHoy, creditosRows, noDebeRows, productosAlerta, productosAgotados, comprasLlegadas] = await Promise.all([
    db.select().from(ventasDiariasTable).where(eq(ventasDiariasTable.fecha, today)),
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
