import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientesTable = pgTable("clientes", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  telefono: text("telefono"),
  correo: text("correo"),
  notas: text("notas"),
  creadoEn: timestamp("creado_en").defaultNow(),
  actualizadoEn: timestamp("actualizado_en").defaultNow(),
});

export const vehiculosClienteTable = pgTable("vehiculos_cliente", {
  id: serial("id").primaryKey(),
  clienteId: integer("cliente_id").notNull(),
  placa: text("placa").notNull(),
  descripcion: text("descripcion"),
  creadoEn: timestamp("creado_en").defaultNow(),
});

export const insertClienteSchema = createInsertSchema(clientesTable).omit({ id: true, creadoEn: true, actualizadoEn: true });
export const insertVehiculoClienteSchema = createInsertSchema(vehiculosClienteTable).omit({ id: true, creadoEn: true });
export type InsertCliente = z.infer<typeof insertClienteSchema>;
export type InsertVehiculoCliente = z.infer<typeof insertVehiculoClienteSchema>;
export type Cliente = typeof clientesTable.$inferSelect;
export type VehiculoCliente = typeof vehiculosClienteTable.$inferSelect;
