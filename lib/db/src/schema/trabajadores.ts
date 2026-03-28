import { pgTable, serial, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const trabajadoresTable = pgTable("trabajadores", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  descuentoSeguro: numeric("descuento_seguro", { precision: 15, scale: 2 }).notNull().default("0"),
  descuentoOtros: numeric("descuento_otros", { precision: 15, scale: 2 }).notNull().default("0"),
  totalGanado: numeric("total_ganado", { precision: 15, scale: 2 }).notNull().default("0"),
  totalDescuentos: numeric("total_descuentos", { precision: 15, scale: 2 }).notNull().default("0"),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamp("creado_en").defaultNow(),
});

export const insertTrabajadorSchema = createInsertSchema(trabajadoresTable).omit({ id: true, creadoEn: true });
export type InsertTrabajador = z.infer<typeof insertTrabajadorSchema>;
export type Trabajador = typeof trabajadoresTable.$inferSelect;
