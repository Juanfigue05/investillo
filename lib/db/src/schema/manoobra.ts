import { pgTable, serial, text, numeric, timestamp, integer, date, foreignKey, index, type PgTableExtraConfigValue } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { creditosTable } from "./creditos";
import { trabajadoresTable } from "./trabajadores";
import { ventasDiariasTable } from "./ventas";

export const manoObraTable = pgTable("mano_obra", {
  id: serial("id").primaryKey(),
  fecha: date("fecha").notNull(),
  descripcion: text("descripcion").notNull(),
  valorTotal: numeric("valor_total", { precision: 15, scale: 2 }).notNull(),
  /** Si la mano de obra pertenece a un crédito/Nos Debe, referencia a creditos.id para mantenerla sincronizada */
  creditoId: integer("credito_id"),
  ventaId: integer("venta_id"),
  creadoEn: timestamp("creado_en").defaultNow(),
}, (table): PgTableExtraConfigValue[] => [
  foreignKey({
    name: "mano_obra_credito_id_fk",
    columns: [table.creditoId],
    foreignColumns: [creditosTable.id],
  }),
  foreignKey({
    name: "mano_obra_venta_id_fk",
    columns: [table.ventaId],
    foreignColumns: [ventasDiariasTable.id],
  }).onDelete("set null"),
  index("mano_obra_credito_id_idx")
    .on(table.creditoId)
    .where(sql`${table.creditoId} IS NOT NULL`),
  index("mano_obra_venta_id_idx")
    .on(table.ventaId)
    .where(sql`${table.ventaId} IS NOT NULL`),
  index("mano_obra_fecha_idx").on(table.fecha),
]);

export const distribucionesTable = pgTable("distribuciones_mano_obra", {
  id: serial("id").primaryKey(),
  manoObraId: integer("mano_obra_id").notNull(),
  trabajadorId: integer("trabajador_id").notNull(),
  trabajadorNombre: text("trabajador_nombre").notNull(),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull(),
  descuentoSeguro: numeric("descuento_seguro", { precision: 15, scale: 2 }).notNull().default("0"),
  descuentoOtros: numeric("descuento_otros", { precision: 15, scale: 2 }).notNull().default("0"),
}, (table) => [
  foreignKey({
    name: "distribuciones_mano_obra_mano_obra_fk",
    columns: [table.manoObraId],
    foreignColumns: [manoObraTable.id],
  }),
  foreignKey({
    name: "distribuciones_mano_obra_trabajador_fk",
    columns: [table.trabajadorId],
    foreignColumns: [trabajadoresTable.id],
  }),
  index("distribuciones_mano_obra_mo_idx").on(table.manoObraId),
  index("distribuciones_mano_obra_trab_idx").on(table.trabajadorId),
]);

export const insertManoObraSchema = createInsertSchema(manoObraTable).omit({ id: true, creadoEn: true });
export const insertDistribucionSchema = createInsertSchema(distribucionesTable).omit({ id: true });
export type InsertManoObra = z.infer<typeof insertManoObraSchema>;
export type InsertDistribucion = z.infer<typeof insertDistribucionSchema>;
export type ManoObra = typeof manoObraTable.$inferSelect;
export type Distribucion = typeof distribucionesTable.$inferSelect;
