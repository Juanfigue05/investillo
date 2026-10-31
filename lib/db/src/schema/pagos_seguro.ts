import { pgTable, serial, integer, numeric, date, timestamp, foreignKey, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { trabajadoresTable } from "./trabajadores";

/** Historial de pagos del seguro social a la entidad, por trabajador */
export const pagosSeguroTable = pgTable("pagos_seguro", {
  id: serial("id").primaryKey(),
  trabajadorId: integer("trabajador_id").notNull(),
  fecha: date("fecha").notNull(),
  monto: numeric("monto", { precision: 15, scale: 2 }).notNull(),
  creadoEn: timestamp("creado_en").defaultNow(),
}, (table) => [
  foreignKey({
    name: "pagos_seguro_trabajador_id_fk",
    columns: [table.trabajadorId],
    foreignColumns: [trabajadoresTable.id],
  }),
  index("pagos_seguro_trabajador_id_idx").on(table.trabajadorId),
]);

export const insertPagoSeguroSchema = createInsertSchema(pagosSeguroTable).omit({ id: true, creadoEn: true });
export type InsertPagoSeguro = z.infer<typeof insertPagoSeguroSchema>;
export type PagoSeguro = typeof pagosSeguroTable.$inferSelect;