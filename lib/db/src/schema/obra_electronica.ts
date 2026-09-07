import { pgTable, serial, integer, text, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const obraElectronicaTable = pgTable("obra_electronica", {
  id: serial("id").primaryKey(),
  trabajadorId: integer("trabajador_id"),
  empleadoNombre: text("empleado_nombre").notNull(),
  fecha: date("fecha").notNull(),
  numeroFactura: text("numero_factura").notNull().default(""),
  vehiculo: text("vehiculo").notNull().default(""),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull(),
  creadoEn: timestamp("creado_en").defaultNow(),
});

export const insertObraElectronicaSchema = createInsertSchema(obraElectronicaTable).omit({ id: true, creadoEn: true });
export type InsertObraElectronica = z.infer<typeof insertObraElectronicaSchema>;
export type ObraElectronica = typeof obraElectronicaTable.$inferSelect;
