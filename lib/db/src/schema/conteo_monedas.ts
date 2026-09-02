import { pgTable, integer, numeric, timestamp } from "drizzle-orm/pg-core";

/** Un solo registro (id=1) — cuánto hay en monedas repartido entre bolsa y caja, para seguimiento manual día a día */
export const conteoMonedasTable = pgTable("conteo_monedas", {
  id: integer("id").primaryKey().default(1),
  bolsa: numeric("bolsa", { precision: 15, scale: 2 }).notNull().default("0"),
  caja: numeric("caja", { precision: 15, scale: 2 }).notNull().default("0"),
  actualizadoEn: timestamp("actualizado_en").defaultNow(),
});