import { pgTable, serial, text, numeric, timestamp, integer, uuid } from "drizzle-orm/pg-core";

export const descuentosInventarioTable = pgTable("descuentos_inventario", {
  id: serial("id").primaryKey(),
  operacionId: uuid("operacion_id").notNull(),
  motivo: text("motivo").notNull(),
  motivoOtro: text("motivo_otro"),
  observacion: text("observacion"),
  productoId: integer("producto_id").notNull(),
  productoNombre: text("producto_nombre").notNull(),
  productoCodigo: text("producto_codigo").notNull(),
  cantidad: numeric("cantidad", { precision: 15, scale: 3 }).notNull(),
  cantidadLocal: numeric("cantidad_local", { precision: 15, scale: 3 }).notNull(),
  cantidadBodega: numeric("cantidad_bodega", { precision: 15, scale: 3 }).notNull(),
  precioCompra: numeric("precio_compra", { precision: 15, scale: 2 }).notNull(),
  precioVenta: numeric("precio_venta", { precision: 15, scale: 2 }).notNull(),
  creadoEn: timestamp("creado_en").defaultNow().notNull(),
});

export type DescuentoInventario = typeof descuentosInventarioTable.$inferSelect;