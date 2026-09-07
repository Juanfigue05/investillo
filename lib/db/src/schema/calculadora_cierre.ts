import { integer, jsonb, pgTable, timestamp } from "drizzle-orm/pg-core";

export const calculadoraCierreTable = pgTable("calculadora_cierre", {
  id: integer("id").primaryKey().default(1),
  datos: jsonb("datos").notNull().default({}),
  actualizadoEn: timestamp("actualizado_en").defaultNow(),
});
