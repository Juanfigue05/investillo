import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const remachadasTable = pgTable("remachadas", {
  id: serial("id").primaryKey(),
  numeroBanda: text("numero_banda").notNull(),
  valorJuego: numeric("valor_juego", { precision: 15, scale: 2 }).notNull(),
  creadoEn: timestamp("creado_en").defaultNow(),
});

export const insertRemachadaSchema = createInsertSchema(remachadasTable).omit({ id: true, creadoEn: true });
export type InsertRemachada = z.infer<typeof insertRemachadaSchema>;
export type Remachada = typeof remachadasTable.$inferSelect;