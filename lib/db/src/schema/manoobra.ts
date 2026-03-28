import { pgTable, serial, text, numeric, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const manoObraTable = pgTable("mano_obra", {
  id: serial("id").primaryKey(),
  fecha: date("fecha").notNull(),
  descripcion: text("descripcion").notNull(),
  valorTotal: numeric("valor_total", { precision: 15, scale: 2 }).notNull(),
  creadoEn: timestamp("creado_en").defaultNow(),
});

export const distribucionesTable = pgTable("distribuciones_mano_obra", {
  id: serial("id").primaryKey(),
  manoObraId: integer("mano_obra_id").notNull(),
  trabajadorId: integer("trabajador_id").notNull(),
  trabajadorNombre: text("trabajador_nombre").notNull(),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull(),
  descuentoSeguro: numeric("descuento_seguro", { precision: 15, scale: 2 }).notNull().default("0"),
  descuentoOtros: numeric("descuento_otros", { precision: 15, scale: 2 }).notNull().default("0"),
});

export const insertManoObraSchema = createInsertSchema(manoObraTable).omit({ id: true, creadoEn: true });
export const insertDistribucionSchema = createInsertSchema(distribucionesTable).omit({ id: true });
export type InsertManoObra = z.infer<typeof insertManoObraSchema>;
export type InsertDistribucion = z.infer<typeof insertDistribucionSchema>;
export type ManoObra = typeof manoObraTable.$inferSelect;
export type Distribucion = typeof distribucionesTable.$inferSelect;
