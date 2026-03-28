import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notasTable = pgTable("notas", {
  id: serial("id").primaryKey(),
  contenido: text("contenido").notNull().default(""),
  actualizadoEn: timestamp("actualizado_en").defaultNow(),
});

export const insertNotasSchema = createInsertSchema(notasTable).omit({ id: true, actualizadoEn: true });
export type InsertNotas = z.infer<typeof insertNotasSchema>;
export type Notas = typeof notasTable.$inferSelect;
