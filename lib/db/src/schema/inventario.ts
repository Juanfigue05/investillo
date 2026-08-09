import { pgTable, serial, text, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productosTable = pgTable("productos", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  codigo: text("codigo").notNull().unique(),
  marca: text("marca"),
  tipo: text("tipo"),
  referencia: text("referencia"),
  adicional: text("adicional"),
  precioCompra: numeric("precio_compra", { precision: 15, scale: 2 }).notNull(),
  precioVentaSinIva: numeric("precio_venta_sin_iva", { precision: 15, scale: 2 }).notNull(),
  precioVentaConIva: numeric("precio_venta_con_iva", { precision: 15, scale: 2 }).notNull(),
  tieneIva: boolean("tiene_iva").notNull().default(false),
  stockActual: numeric("stock_actual", { precision: 15, scale: 3 }).notNull().default("0"),
  stockMinimo: numeric("stock_minimo", { precision: 15, scale: 3 }).notNull().default("0"),
  creadoEn: timestamp("creado_en").defaultNow(),
  actualizadoEn: timestamp("actualizado_en").defaultNow(),
});

export const insertProductoSchema = createInsertSchema(productosTable).omit({ id: true, creadoEn: true, actualizadoEn: true });
export type InsertProducto = z.infer<typeof insertProductoSchema>;
export type Producto = typeof productosTable.$inferSelect;
