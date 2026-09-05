import { pgTable, serial, date, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tensionadasTable = pgTable("tensionadas", {
  id: serial("id").primaryKey(),
  fecha: date("fecha").notNull(),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull(),
  creadoEn: timestamp("creado_en").defaultNow(),
});

export const insertTensionadaSchema = createInsertSchema(tensionadasTable).omit({ id: true, creadoEn: true });
export type InsertTensionada = z.infer<typeof insertTensionadaSchema>;
export type Tensionada = typeof tensionadasTable.$inferSelect;