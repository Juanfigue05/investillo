import { pgTable, serial, text, numeric, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const creditosTable = pgTable("creditos", {
  id: serial("id").primaryKey(),
  fechaFactura: date("fecha_factura").notNull(),
  placaVehiculo: text("placa_vehiculo"),
  nombreCliente: text("nombre_cliente").notNull(),
  telefonoCliente: text("telefono_cliente"),
  descripcion: text("descripcion"),
  valorCredito: numeric("valor_credito", { precision: 15, scale: 2 }).notNull(),
  valorAbonado: numeric("valor_abonado", { precision: 15, scale: 2 }).notNull().default("0"),
  creadoEn: timestamp("creado_en").defaultNow(),
  actualizadoEn: timestamp("actualizado_en").defaultNow(),
});

export const insertCreditoSchema = createInsertSchema(creditosTable).omit({ id: true, creadoEn: true, actualizadoEn: true });
export type InsertCredito = z.infer<typeof insertCreditoSchema>;
export type Credito = typeof creditosTable.$inferSelect;
