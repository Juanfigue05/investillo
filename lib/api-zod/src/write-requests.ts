import { z } from "zod";
import { parseNumeroColombia } from "./numeros";

const numeroTexto = z.string().trim().min(1).refine((value) => {
  const limpio = value.replace(/[$\s']/g, "");
  const formatoColombiano =
    /^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/;
  const formatoDecimal =
    /^-?\d+\.\d+$/;

  return (
    (formatoColombiano.test(limpio) || formatoDecimal.test(limpio)) &&
    Number.isFinite(parseNumeroColombia(value))
  );
}, "Debe ser un número válido");

const numero = z.union([z.number().finite(), numeroTexto]);
const numeroNoNegativo = numero.refine(
  (value) => (typeof value === "number" ? value >= 0 : parseNumeroColombia(value) >= 0),
  "No puede ser negativo",
);
const idPositivo = z.union([
  z.number().int().positive(),
  z.string()
    .regex(/^[1-9]\d*$/)
    .refine((value) => Number.isSafeInteger(Number(value)))
    .transform(Number),
]);
const textoFecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const fecha = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === value;
}, "Debe ser una fecha válida");
const textoOpcional = z.string().nullish();

const distribucionSchema = z.object({
  trabajadorId: idPositivo,
  trabajadorNombre: z.string().optional(),
  valor: numeroNoNegativo,
}).passthrough();

const datosVenta = {
  fecha: textoFecha,
  referencia: z.string(),
  tipoLinea: z.enum(["venta", "manoobra", "credito"]).optional(),
  productoId: idPositivo.nullish(),
  productoNombre: textoOpcional,
  productoCodigo: textoOpcional,
  productoMarca: textoOpcional,
  cantidad: numero.refine(
    (value) => (typeof value === "number" ? value > 0 : parseNumeroColombia(value) > 0),
    "Debe ser mayor que cero",
  ),
  precioCompraUnidad: numeroNoNegativo.optional(),
  precioVentaUnidad: numeroNoNegativo,
  precioVentaTotal: numeroNoNegativo,
  beneficio: numero.optional(),
  descripcion: textoOpcional,
  formaPago: textoOpcional,
  origen: z.string().optional(),
  afectaInventario: z.boolean().optional(),
  distribuciones: z.array(distribucionSchema).optional(),
};

export const crearProductoRequest = z.object({
  nombre: z.string().trim().min(1),
  codigo: z.string().trim().min(1),
  marca: textoOpcional,
  tipo: textoOpcional,
  referencia: textoOpcional,
  adicional: textoOpcional,
  precioCompra: numeroNoNegativo,
  precioVentaSinIva: numeroNoNegativo,
  tieneIva: z.boolean(),
  stockActual: numeroNoNegativo,
  stockMinimo: numeroNoNegativo,
}).passthrough();

export const actualizarProductoRequest = z.object({
  nombre: z.string().trim().min(1),
  codigo: z.string().trim().min(1),
  marca: textoOpcional,
  tipo: textoOpcional,
  referencia: textoOpcional,
  adicional: textoOpcional,
  precioCompra: numeroNoNegativo,
  precioVentaSinIva: numeroNoNegativo,
  tieneIva: z.boolean(),
  stockLocal: numeroNoNegativo.optional(),
  stockBodega: numeroNoNegativo.optional(),
  stockActual: numeroNoNegativo.optional(),
  stockMinimo: numeroNoNegativo,
  activo: z.boolean().optional(),
}).passthrough();

export const actualizarStockRequest = z.object({
  cantidad: numero,
  precioCompra: numeroNoNegativo.optional(),
  precioVentaSinIva: numeroNoNegativo.optional(),
  tieneIva: z.boolean().optional(),
}).passthrough();

export const crearVentaRequest = z.object(datosVenta).passthrough();
export const actualizarVentaRequest = z.object(datosVenta).passthrough();

export const crearManoObraRequest = z.object({
  fecha: textoFecha,
  referencia: z.string(),
  valorTotal: numeroNoNegativo,
  distribuciones: z.array(distribucionSchema).optional(),
  productoNombre: z.string().optional(),
  productoMarca: z.string().optional(),
  descripcion: textoOpcional,
  formaPago: textoOpcional,
}).passthrough();

export const crearLotePagoAntiguoRequest = z.object({
  items: z.array(z.object({
    fecha: textoFecha,
    referencia: z.string().trim().min(1),
    tipoLinea: z.enum(["venta", "manoobra", "credito"]).optional(),
    productoId: idPositivo.nullish(),
    productoNombre: z.string().trim().min(1),
    productoCodigo: textoOpcional,
    productoMarca: textoOpcional,
    cantidad: numero.refine(
      (value) => (typeof value === "number" ? value > 0 : parseNumeroColombia(value) > 0),
      "Debe ser mayor que cero",
    ),
    precioCompraUnidad: numeroNoNegativo.optional(),
    precioVentaUnidad: numeroNoNegativo,
    precioVentaTotal: numeroNoNegativo,
    beneficio: numero.optional(),
    descripcion: textoOpcional,
    formaPago: textoOpcional,
  }).passthrough()).min(1),
}).passthrough();

export const reordenarVentasRequest = z.object({
  ids: z.array(idPositivo).min(1),
  fecha: textoFecha.optional(),
}).passthrough();

export const trasladarInventarioRequest = z.object({
  cantidad: numero.refine(
    (value) => (typeof value === "number" ? value > 0 : parseNumeroColombia(value) > 0),
    "Debe ser mayor que cero",
  ),
  direccion: z.enum(["bodega-local", "local-bodega"]),
}).passthrough();

export const crearCompraRequest = z.object({
  productoId: idPositivo,
  estado: z.enum(["pendiente", "llegado"]).optional(),
}).passthrough();

export const actualizarCompraRequest = z.object({
  estado: z.enum(["pendiente", "llegado"]),
  cantidadRecibida: numeroNoNegativo.nullish(),
  cantidadLocal: numeroNoNegativo.nullish(),
  cantidadBodega: numeroNoNegativo.nullish(),
  nuevoPrecioCompra: numeroNoNegativo.nullish(),
  nuevoPrecioVentaSinIva: numeroNoNegativo.nullish(),
  tieneIva: z.boolean().nullish(),
  proveedor: textoOpcional,
  actualizarPrecioInventario: z.boolean().nullish(),
  fechaLlegada: textoFecha.or(z.literal("")).optional(),
}).passthrough();

export const llegadaLoteComprasRequest = z.object({
  proveedor: z.string().trim().min(1),
  fechaLlegada: textoFecha.or(z.literal("")).optional(),
  items: z.array(z.object({
    id: idPositivo,
    cantidadRecibida: numeroNoNegativo,
    cantidadLocal: numeroNoNegativo.optional(),
    cantidadBodega: numeroNoNegativo.optional(),
    nuevoPrecioCompra: numeroNoNegativo,
    nuevoPrecioVentaSinIva: numeroNoNegativo,
    tieneIva: z.boolean(),
    actualizarPrecioInventario: z.boolean(),
  }).passthrough()).min(1),
}).passthrough();

export const corregirCompraRequest = z.object({
  cantidadRecibida: numeroNoNegativo,
  precioCompraRegistrado: numeroNoNegativo.optional(),
  precioVentaRegistrado: numeroNoNegativo.optional(),
}).passthrough();
