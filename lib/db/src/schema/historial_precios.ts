import { pgTable, serial, text, numeric, timestamp, date, integer, foreignKey, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { comprasTable } from "./compras";
import { productosTable } from "./inventario";

/** Registro histórico de precios de productos cada vez que llega una compra */
export const historialPreciosTable = pgTable("historial_precios", {
  id: serial("id").primaryKey(),
  productoId: integer("producto_id").notNull(),
  productoNombre: text("producto_nombre").notNull(),
  productoCodigo: text("producto_codigo"),
  precioCompra: numeric("precio_compra", { precision: 15, scale: 2 }).notNull(),
  precioVenta: numeric("precio_venta", { precision: 15, scale: 2 }).notNull(),
  fecha: date("fecha").notNull(),
  /** 'compra' = registrado al confirmar llegada, 'manual' = ingresado manualmente */
  origen: text("origen").notNull().default("compra"),
  compraId: integer("compra_id"),
  proveedor: text("proveedor"),
  actualizoPrecioInventario: text("actualizo_precio_inventario").default("no"),
  creadoEn: timestamp("creado_en").defaultNow(),
}, (table) => [
  foreignKey({
    name: "historial_precios_compra_id_fk",
    columns: [table.compraId],
    foreignColumns: [comprasTable.id],
  }).onDelete("set null"),
  foreignKey({
    name: "historial_precios_producto_id_fk",
    columns: [table.productoId],
    foreignColumns: [productosTable.id],
  }),
  index("historial_precios_producto_id_idx").on(table.productoId),
]);

export const insertHistorialPrecioSchema = createInsertSchema(historialPreciosTable).omit({ id: true, creadoEn: true });
export type InsertHistorialPrecio = z.infer<typeof insertHistorialPrecioSchema>;
export type HistorialPrecio = typeof historialPreciosTable.$inferSelect;
