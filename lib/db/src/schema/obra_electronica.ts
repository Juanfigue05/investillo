import { pgTable, serial, integer, text, numeric, date, timestamp, foreignKey, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { trabajadoresTable } from "./trabajadores";

export const obraElectronicaTable = pgTable("obra_electronica", {
  id: serial("id").primaryKey(),
  trabajadorId: integer("trabajador_id"),
  empleadoNombre: text("empleado_nombre").notNull(),
  fecha: date("fecha").notNull(),
  numeroFactura: text("numero_factura").notNull().default(""),
  vehiculo: text("vehiculo").notNull().default(""),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull(),
  creadoEn: timestamp("creado_en").defaultNow(),
}, (table) => [
  foreignKey({
    name: "obra_electronica_trabajador_id_fk",
    columns: [table.trabajadorId],
    foreignColumns: [trabajadoresTable.id],
  }),
  index("obra_electronica_trabajador_id_idx")
    .on(table.trabajadorId)
    .where(sql`${table.trabajadorId} IS NOT NULL`),
]);

export const insertObraElectronicaSchema = createInsertSchema(obraElectronicaTable).omit({ id: true, creadoEn: true });
export type InsertObraElectronica = z.infer<typeof insertObraElectronicaSchema>;
export type ObraElectronica = typeof obraElectronicaTable.$inferSelect;
