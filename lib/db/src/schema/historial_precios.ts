import { pgTable, serial, text, numeric, timestamp, date, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

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
});

export const insertHistorialPrecioSchema = createInsertSchema(historialPreciosTable).omit({ id: true, creadoEn: true });
export type InsertHistorialPrecio = z.infer<typeof insertHistorialPrecioSchema>;
export type HistorialPrecio = typeof historialPreciosTable.$inferSelect;
