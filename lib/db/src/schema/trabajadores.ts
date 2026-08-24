import { pgTable, serial, text, numeric, boolean, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const trabajadoresTable = pgTable("trabajadores", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  descuentoSeguro: numeric("descuento_seguro", { precision: 15, scale: 2 }).notNull().default("0"),
  descuentoOtros: numeric("descuento_otros", { precision: 15, scale: 2 }).notNull().default("0"),
  totalGanado: numeric("total_ganado", { precision: 15, scale: 2 }).notNull().default("0"),
  totalDescuentos: numeric("total_descuentos", { precision: 15, scale: 2 }).notNull().default("0"),
  activo: boolean("activo").notNull().default(true),

  // ── Perfil del trabajador ──
  numeroSeguro: text("numero_seguro"),
  telefono: text("telefono"),
  correo: text("correo"),
  eps: text("eps"),

  // ── Seguimiento del seguro social ──
  aplicaSeguro: boolean("aplica_seguro").notNull().default(false),
  totalSeguroDescontado: numeric("total_seguro_descontado", { precision: 15, scale: 2 }).notNull().default("0"),
  fechaProximoPagoSeguro: date("fecha_proximo_pago_seguro"),

  creadoEn: timestamp("creado_en").defaultNow(),
});

export const insertTrabajadorSchema = createInsertSchema(trabajadoresTable).omit({ id: true, creadoEn: true });
export type InsertTrabajador = z.infer<typeof insertTrabajadorSchema>;
export type Trabajador = typeof trabajadoresTable.$inferSelect;