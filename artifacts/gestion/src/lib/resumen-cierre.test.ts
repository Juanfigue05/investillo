import { describe, expect, it } from "vitest";
import { resumirCierre } from "./resumen-cierre";

describe("resumen del cierre diario", () => {
  it("consolida mano de obra, descuentos, cuentas y total neto", () => {
    expect(resumirCierre([
      { mo: 100_000, descuento: 30_000, seguro: 0, leDamos: 5_000, nosDebe: 10_000, total: 65_000 },
      { mo: 80_000, descuento: 0, seguro: 5_000, leDamos: 0, nosDebe: 0, total: 75_000 },
    ])).toEqual({
      manoObra: 180_000,
      descuentos: 30_000,
      seguros: 5_000,
      leDamos: 5_000,
      nosDebe: 10_000,
      total: 140_000,
    });
  });
});
