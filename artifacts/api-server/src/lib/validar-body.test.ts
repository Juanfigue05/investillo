import { describe, expect, it } from "vitest";
import {
  actualizarCompraRequest,
  actualizarProductoRequest,
  actualizarVentaRequest,
  crearLotePagoAntiguoRequest,
  crearManoObraRequest,
  crearProductoRequest,
  crearVentaRequest,
  llegadaLoteComprasRequest,
} from "@workspace/api-zod/write-requests";

describe("esquemas Zod de escritura", () => {
  it("acepta formatos reales de inventario y conserva campos usados por el formulario", () => {
    const result = crearProductoRequest.safeParse({
      nombre: "Producto",
      codigo: "ABC-1",
      precioCompra: 12_500,
      precioVentaSinIva: 20_000,
      tieneIva: true,
      stockActual: 2,
      stockMinimo: 1,
      campoFuturo: "se conserva en el payload original",
    });

    expect(result.success).toBe(true);
  });

  it("permite el cuerpo actual de edición de inventario y sus valores numéricos de sincronización", () => {
    expect(actualizarProductoRequest.safeParse({
      nombre: "Producto",
      codigo: "ABC-1",
      precioCompra: "12.500",
      precioVentaSinIva: "20.000",
      tieneIva: true,
      stockLocal: 1,
      stockBodega: 2,
      stockMinimo: 0,
      activo: true,
    }).success).toBe(true);
  });

  it("acepta valores numéricos y campos opcionales de ventas, incluida mano de obra", () => {
    expect(crearVentaRequest.safeParse({
      fecha: "2026-03-18",
      referencia: "",
      tipoLinea: "venta",
      cantidad: 1.5,
      precioCompraUnidad: 0,
      precioVentaUnidad: 12_500,
      precioVentaTotal: 18_750,
      beneficio: 18_750,
      origen: "venta_normal",
      afectaInventario: false,
    }).success).toBe(true);

    expect(actualizarVentaRequest.safeParse({
      fecha: "2026-03-18",
      referencia: "R-1",
      tipoLinea: "manoobra",
      cantidad: 1,
      precioCompraUnidad: 0,
      precioVentaUnidad: 70_000,
      precioVentaTotal: 70_000,
      beneficio: 70_000,
      distribuciones: [{ trabajadorId: 1, trabajadorNombre: "Pablo", valor: 35_000 }],
    }).success).toBe(true);

    expect(crearManoObraRequest.safeParse({
      fecha: "2026-03-18",
      referencia: "R-1",
      valorTotal: 70_000,
      distribuciones: [{ trabajadorId: 1, trabajadorNombre: "Pablo", valor: 70_000 }],
    }).success).toBe(true);
  });

  it("acepta los lotes de pagos antiguos serializados por la interfaz", () => {
    expect(crearLotePagoAntiguoRequest.safeParse({
      items: [{
        fecha: "2026-03-18",
        referencia: "R-1",
        tipoLinea: "venta",
        productoNombre: "Producto",
        cantidad: 1,
        precioCompraUnidad: 0,
        precioVentaUnidad: 12_500,
        precioVentaTotal: 12_500,
        beneficio: 0,
      }],
    }).success).toBe(true);
  });

  it("acepta llegadas individuales y por lote, incluidos números en formato colombiano", () => {
    expect(actualizarCompraRequest.safeParse({
      estado: "llegado",
      cantidadRecibida: "1,5",
      cantidadLocal: 1,
      cantidadBodega: 0.5,
      nuevoPrecioCompra: "12.500",
      tieneIva: false,
      proveedor: "Proveedor",
      actualizarPrecioInventario: true,
    }).success).toBe(true);

    expect(llegadaLoteComprasRequest.safeParse({
      proveedor: "Proveedor",
      fechaLlegada: "",
      items: [{
        id: 4,
        cantidadRecibida: 2,
        cantidadLocal: 1,
        cantidadBodega: 1,
        nuevoPrecioCompra: 12_500,
        nuevoPrecioVentaSinIva: 20_000,
        tieneIva: false,
        actualizarPrecioInventario: true,
      }],
    }).success).toBe(true);
  });

  it("rechaza cantidades inválidas, fechas inexistentes y listas de trabajadores malformadas", () => {
    expect(crearProductoRequest.safeParse({
      nombre: "Producto",
      codigo: "ABC-1",
      precioCompra: "no es un precio",
      precioVentaSinIva: 20_000,
      tieneIva: true,
      stockActual: 2,
      stockMinimo: 1,
    }).success).toBe(false);

    expect(crearVentaRequest.safeParse({
      fecha: "2026-02-31",
      referencia: "R-1",
      cantidad: 1,
      precioCompraUnidad: 0,
      precioVentaUnidad: 1,
      precioVentaTotal: 1,
      beneficio: 1,
    }).success).toBe(false);

    expect(crearManoObraRequest.safeParse({
      fecha: "2026-03-18",
      referencia: "R-1",
      valorTotal: 1_000,
      distribuciones: [{ trabajadorId: "cualquiera", valor: "invalid" }],
    }).success).toBe(false);
  });
});
