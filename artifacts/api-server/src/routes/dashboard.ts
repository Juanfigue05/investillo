import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ventasDiariasTable, creditosTable, productosTable } from "@workspace/db/schema";
import { eq, lte, sql, and } from "drizzle-orm";

const router: IRouter = Router();

function toNum(v: unknown): number {
  return typeof v === "string" ? parseFloat(v) : Number(v);
}

router.get("/", async (req, res) => {
  const today = new Date().toISOString().split("T")[0];

  const ventasHoy = await db.select().from(ventasDiariasTable).where(eq(ventasDiariasTable.fecha, today));

  const totalVentasHoy = ventasHoy
    .filter(v => v.tipoLinea === "venta")
    .reduce((acc, v) => acc + toNum(v.precioVentaTotal), 0);

  const totalManoObraHoy = ventasHoy
    .filter(v => v.tipoLinea === "manoobra")
    .reduce((acc, v) => acc + toNum(v.precioVentaTotal), 0);

  const creditos = await db.select().from(creditosTable);
  const noDeben = creditos.reduce((acc, c) => {
    const restante = toNum(c.valorCredito) - toNum(c.valorAbonado);
    return acc + (restante > 0 ? restante : 0);
  }, 0);

  const productosAlerta = await db
    .select()
    .from(productosTable)
    .where(lte(productosTable.stockActual, sql`${productosTable.stockMinimo} + 1`));

  const productosAgotados = await db
    .select()
    .from(productosTable)
    .where(lte(productosTable.stockActual, productosTable.stockMinimo));

  res.json({
    totalVentasHoy,
    totalManoObraHoy,
    noDeben,
    productosAlerta: productosAlerta.length,
    productosAgotados: productosAgotados.length,
    ventasHoy: ventasHoy.filter(v => v.tipoLinea === "venta").length,
  });
});

export default router;
