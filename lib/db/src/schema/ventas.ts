import { pgTable, serial, text, numeric, timestamp, date, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ventasDiariasTable = pgTable("ventas_diarias", {
  id: serial("id").primaryKey(),
  fecha: date("fecha").notNull(),
  referencia: text("referencia").notNull(),
  tipoLinea: text("tipo_linea").notNull().default("venta"),
  productoId: integer("producto_id"),
  productoNombre: text("producto_nombre"),
  productoCodigo: text("producto_codigo"),
  productoMarca: text("producto_marca"),
  cantidad: numeric("cantidad", { precision: 15, scale: 3 }).notNull(),
  precioCompraUnidad: numeric("precio_compra_unidad", { precision: 15, scale: 2 }).notNull().default("0"),
  precioVentaUnidad: numeric("precio_venta_unidad", { precision: 15, scale: 2 }).notNull(),
  precioVentaTotal: numeric("precio_venta_total", { precision: 15, scale: 2 }).notNull(),
  beneficio: numeric("beneficio", { precision: 15, scale: 2 }).notNull().default("0"),
  descripcion: text("descripcion"),
  /** FK al abono que generó esta fila — para poder revertirla al eliminar/editar el abono */
  creditoAbonoId: integer("credito_abono_id"),
  creadoEn: timestamp("creado_en").defaultNow(),
});

export const insertVentaDiariaSchema = createInsertSchema(ventasDiariasTable).omit({ id: true, creadoEn: true });
export type InsertVentaDiaria = z.infer<typeof insertVentaDiariaSchema>;
export type VentaDiaria = typeof ventasDiariasTable.$inferSelect;
