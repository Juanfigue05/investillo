import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const cierreDiarioTable = pgTable("cierre_diario", {
  id: serial("id").primaryKey(),
  fecha: text("fecha").notNull().unique(), // YYYY-MM-DD
  datos: jsonb("datos").notNull(), // JSON with all worker data
  totalPagar: integer("total_pagar").notNull().default(0),
  creadoEn: timestamp("creado_en").defaultNow(),
});
