import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const historialDiasTable = pgTable("historial_dias", {
  id: serial("id").primaryKey(),
  fecha: text("fecha").notNull().unique(), // YYYY-MM-DD, immutable after creation
  notas: text("notas"),
  guardadoEn: timestamp("guardado_en").defaultNow().notNull(),
});

export const insertHistorialDiaSchema = createInsertSchema(historialDiasTable).omit({ id: true, guardadoEn: true });
export type InsertHistorialDia = z.infer<typeof insertHistorialDiaSchema>;
export type HistorialDia = typeof historialDiasTable.$inferSelect;
