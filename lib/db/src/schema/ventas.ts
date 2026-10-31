import { pgTable, serial, text, numeric, timestamp, date, integer, boolean, foreignKey, index, type PgTableExtraConfigValue } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { productosTable } from "./inventario";
import { abonosCreditosTable } from "./creditos";
import { manoObraTable } from "./manoobra";

export const ventasDiariasTable = pgTable("ventas_diarias", {
  id: serial("id").primaryKey(),
  fecha: date("fecha").notNull(),
  referencia: text("referencia").notNull(),
  tipoLinea: text("tipo_linea").notNull().default("venta"),
  productoId: integer("producto_id"),
  productoNombre: text("producto_nombre"),
  productoCodigo: text("producto_codigo"),
  productoMarca: text("producto_marca"),
  cantidad: numeric("cantidad", { precision: 15, scale: 3 }).notNull(),
  precioCompraUnidad: numeric("precio_compra_unidad", { precision: 15, scale: 2 }).notNull().default("0"),
  precioVentaUnidad: numeric("precio_venta_unidad", { precision: 15, scale: 2 }).notNull(),
  precioVentaTotal: numeric("precio_venta_total", { precision: 15, scale: 2 }).notNull(),
  beneficio: numeric("beneficio", { precision: 15, scale: 2 }).notNull().default("0"),
  descripcion: text("descripcion"),
  formaPago: text("forma_pago"),
  orden: integer("orden"),
  /** FK al abono que generó esta fila — para poder revertirla al eliminar/editar el abono */
  creditoAbonoId: integer("credito_abono_id"),
  origen: text("origen").notNull().default("venta_normal"),
  afectaInventario: boolean("afecta_inventario").notNull().default(true),
  manoObraId: integer("mano_obra_id"),
  creadoEn: timestamp("creado_en").defaultNow(),
}, (table): PgTableExtraConfigValue[] => [
  foreignKey({
    name: "ventas_diarias_credito_abono_id_fk",
    columns: [table.creditoAbonoId],
    foreignColumns: [abonosCreditosTable.id],
  }),
  foreignKey({
    name: "ventas_diarias_producto_id_fk",
    columns: [table.productoId],
    foreignColumns: [productosTable.id],
  }),
  foreignKey({
    name: "ventas_diarias_mano_obra_id_fk",
    columns: [table.manoObraId],
    foreignColumns: [manoObraTable.id],
  }).onDelete("set null"),
  index("ventas_diarias_fecha_idx").on(table.fecha),
  index("ventas_diarias_credito_abono_id_idx")
    .on(table.creditoAbonoId)
    .where(sql`${table.creditoAbonoId} IS NOT NULL`),
  index("ventas_diarias_producto_id_idx")
    .on(table.productoId)
    .where(sql`${table.productoId} IS NOT NULL`),
  index("ventas_diarias_mano_obra_id_idx")
    .on(table.manoObraId)
    .where(sql`${table.manoObraId} IS NOT NULL`),
]);

export const insertVentaDiariaSchema = createInsertSchema(ventasDiariasTable).omit({ id: true, creadoEn: true });
export type InsertVentaDiaria = z.infer<typeof insertVentaDiariaSchema>;
export type VentaDiaria = typeof ventasDiariasTable.$inferSelect;
