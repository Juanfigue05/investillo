import { describe, expect, it } from "vitest";
import { resumirOperacionDiaria } from "./resumen-operativo-dia";

describe("resumen operativo diario", () => {
  it("separa ventas, abonos, mano de obra e egresos para calcular el balance", () => {
    expect(resumirOperacionDiaria([
      { tipoLinea: "venta", precioVentaTotal: "100000" },
      { tipoLinea: "credito", precioVentaTotal: 25_000 },
      { tipoLinea: "manoobra", precioVentaTotal: 40_000 },
      { tipoLinea: "otro", precioVentaTotal: 12_000 },
    ], 30_000, 45_000)).toEqual({
      ventasProductos: 100_000,
      abonosCredito: 25_000,
      manoObraVendida: 40_000,
      egresosCompras: 30_000,
      manoObraPorPagar: 45_000,
      ingresos: 165_000,
      egresos: 75_000,
      balanceEstimado: 90_000,
    });
  });
});
