import { pgTable, serial, integer, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Historial de pagos del seguro social a la entidad, por trabajador */
export const pagosSeguroTable = pgTable("pagos_seguro", {
  id: serial("id").primaryKey(),
  trabajadorId: integer("trabajador_id").notNull(),
  fecha: date("fecha").notNull(),
  monto: numeric("monto", { precision: 15, scale: 2 }).notNull(),
  creadoEn: timestamp("creado_en").defaultNow(),
});

export const insertPagoSeguroSchema = createInsertSchema(pagosSeguroTable).omit({ id: true, creadoEn: true });
export type InsertPagoSeguro = z.infer<typeof insertPagoSeguroSchema>;
export type PagoSeguro = typeof pagosSeguroTable.$inferSelect;