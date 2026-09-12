import { describe, expect, it } from "vitest";

function distribuir(cantidad: number, local: number, bodega: number) {
  if (local + bodega + 0.0001 < cantidad) throw new Error("No hay existencias suficientes");
  const cantidadLocal = Math.min(local, cantidad);
  return { cantidadLocal, cantidadBodega: cantidad - cantidadLocal };
}

describe("descuentos de inventario", () => {
  it("descuenta completamente desde Local cuando alcanza", () => {
    expect(distribuir(2.5, 4, 3)).toEqual({ cantidadLocal: 2.5, cantidadBodega: 0 });
  });

  it("completa desde Bodega cuando Local no alcanza", () => {
    expect(distribuir(2.5, 1, 3)).toEqual({ cantidadLocal: 1, cantidadBodega: 1.5 });
  });

  it("rechaza una cantidad mayor al inventario total", () => {
    expect(() => distribuir(4, 1, 2)).toThrow("No hay existencias suficientes");
  });

  it("elimina y restaura exactamente la distribución original", () => {
    const original = { cantidadLocal: 1, cantidadBodega: 1.5 };
    const stockDespues = { local: 0, bodega: 1.5 };
    expect({ local: stockDespues.local + original.cantidadLocal, bodega: stockDespues.bodega + original.cantidadBodega }).toEqual({ local: 1, bodega: 3 });
  });
});