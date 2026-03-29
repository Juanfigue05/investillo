import { pgTable, serial, text, numeric, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

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
  fechaLlegada: text("fecha_llegada"),
  proveedor: text("proveedor"),
  precioCompraRegistrado: numeric("precio_compra_registrado", { precision: 15, scale: 2 }),
  precioVentaRegistrado: numeric("precio_venta_registrado", { precision: 15, scale: 2 }),
  creadoEn: timestamp("creado_en").defaultNow(),
  actualizadoEn: timestamp("actualizado_en").defaultNow(),
});

export const insertCompraSchema = createInsertSchema(comprasTable).omit({ id: true, creadoEn: true, actualizadoEn: true });
export type InsertCompra = z.infer<typeof insertCompraSchema>;
export type Compra = typeof comprasTable.$inferSelect;
