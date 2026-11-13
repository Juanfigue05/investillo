import { describe, expect, it } from "vitest";
import { resumirComprasRecibidas } from "./compras-resumen";

describe("resumen diario de compras recibidas", () => {
  it("suma solo compras llegadas en la fecha solicitada", () => {
    expect(resumirComprasRecibidas([
      {
        id: 1,
        estado: "llegado",
        fechaLlegada: "2026-03-10",
        productoNombre: "Filtro",
        proveedor: "Proveedor A",
        cantidadRecibida: "2.5",
        precioCompraRegistrado: "10000",
      },
      {
        id: 2,
        estado: "pendiente",
        fechaLlegada: "2026-03-10",
        productoNombre: "Aceite",
        proveedor: null,
        cantidadRecibida: "1",
        precioCompraRegistrado: "20000",
      },
      {
        id: 3,
        estado: "llegado",
        fechaLlegada: "2026-03-09",
        productoNombre: "Bujía",
        proveedor: null,
        cantidadRecibida: "1",
        precioCompraRegistrado: "5000",
      },
    ], "2026-03-10")).toEqual({
      fecha: "2026-03-10",
      cantidadCompras: 1,
      total: 25_000,
      items: [{
        id: 1,
        productoNombre: "Filtro",
        proveedor: "Proveedor A",
        cantidad: 2.5,
        precioUnitario: 10_000,
        total: 25_000,
      }],
    });
  });
});
