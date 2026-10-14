import { describe, expect, it } from "vitest";
import { esLineaManoObra } from "./conceptos-mano-obra";

describe("esLineaManoObra", () => {
  it.each(["Mano de Obra", "Soldadura", "Chispeada", "Pulida"])(
    "reconoce el concepto %s sin confundirlo con una venta",
    (concepto) => {
      expect(esLineaManoObra(concepto)).toBe(true);
    },
  );

  it("ignora mayúsculas y espacios externos", () => {
    expect(esLineaManoObra("  SOLDADURA  ")).toBe(true);
  });

  it("no reclasifica un producto de inventario con el mismo nombre", () => {
    expect(esLineaManoObra("Soldadura", 123)).toBe(false);
  });

  it("no reclasifica otros conceptos", () => {
    expect(esLineaManoObra("Filtro")).toBe(false);
  });
});
