import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const cierreDiarioBorradoresTable = pgTable("cierre_diario_borradores", {
  id: serial("id").primaryKey(),
  fecha: text("fecha").notNull().unique(),
  datos: jsonb("datos").notNull(),
  actualizadoEn: timestamp("actualizado_en").defaultNow().notNull(),
});
