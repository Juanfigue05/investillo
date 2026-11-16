import { describe, expect, it } from "vitest";
import { debeAjustarInventarioVenta } from "./ventas-inventario.logic";

describe("impacto de ventas en el inventario", () => {
  it("nunca ajusta inventario para pagos de crédito antiguo", () => {
    expect(debeAjustarInventarioVenta({
      origen: "pago_credito_antiguo",
      afectaInventario: true,
    })).toBe(false);
    expect(debeAjustarInventarioVenta({
      origen: "pago_credito_antiguo",
      afectaInventario: false,
    })).toBe(false);
  });

  it("respeta afectaInventario para ventas de otros orígenes", () => {
    expect(debeAjustarInventarioVenta({
      origen: "venta_normal",
      afectaInventario: true,
    })).toBe(true);
    expect(debeAjustarInventarioVenta({
      origen: "venta_normal",
      afectaInventario: false,
    })).toBe(false);
  });
});
