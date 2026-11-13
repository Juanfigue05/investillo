import { pgTable, serial, text, numeric, timestamp, integer, foreignKey, index, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productosTable } from "./inventario";

export interface PreciosInventarioCompra {
  precioCompra: number;
  precioVentaSinIva: number;
  precioVentaConIva: number;
  tieneIva: boolean;
}

export const comprasTable = pgTable("compras", {
  id: serial("id").primaryKey(),
  productoId: integer("producto_id").notNull(),
  productoNombre: text("producto_nombre").notNull(),
  productoCodigo: text("producto_codigo").notNull(),
  productoMarca: text("producto_marca"),
  stockActual: numeric("stock_actual", { precision: 15, scale: 3 }).notNull(),
  stockMinimo: numeric("stock_minimo", { precision: 15, scale: 3 }).notNull(),
  estado: text("estado").notNull().default("pendiente"),
  cantidadRecibida: numeric("cantidad_recibida", { precision: 15, scale: 3 }),
  cantidadLocalRecibida: numeric("cantidad_local_recibida", { precision: 15, scale: 3 }),
  cantidadBodegaRecibida: numeric("cantidad_bodega_recibida", { precision: 15, scale: 3 }),
  fechaLlegada: text("fecha_llegada"),
  proveedor: text("proveedor"),
  precioCompraRegistrado: numeric("precio_compra_registrado", { precision: 15, scale: 2 }),
  precioVentaRegistrado: numeric("precio_venta_registrado", { precision: 15, scale: 2 }),
  preciosInventarioAntes: jsonb("precios_inventario_antes").$type<PreciosInventarioCompra>(),
  preciosInventarioAplicados: jsonb("precios_inventario_aplicados").$type<PreciosInventarioCompra>(),
  preciosInventarioActualizados: boolean("precios_inventario_actualizados").notNull().default(false),
  creadoEn: timestamp("creado_en").defaultNow(),
  actualizadoEn: timestamp("actualizado_en").defaultNow(),
}, (table) => [
  foreignKey({
    name: "compras_producto_id_fk",
    columns: [table.productoId],
    foreignColumns: [productosTable.id],
  }),
  index("compras_producto_id_idx").on(table.productoId),
]);

export const insertCompraSchema = createInsertSchema(comprasTable).omit({ id: true, creadoEn: true, actualizadoEn: true });
export type InsertCompra = z.infer<typeof insertCompraSchema>;
export type Compra = typeof comprasTable.$inferSelect;
