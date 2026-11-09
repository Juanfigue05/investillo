import {
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { productosTable } from "./inventario";

export const movimientosInventarioTable = pgTable(
  "movimientos_inventario",
  {
    id: serial("id").primaryKey(),
    operationId: uuid("operation_id").notNull(),
    productoId: integer("producto_id").notNull(),
    productoNombre: text("producto_nombre").notNull(),
    productoCodigo: text("producto_codigo").notNull(),
    tipo: text("tipo").notNull(),
    motivo: text("motivo").notNull(),
    ubicacion: text("ubicacion").notNull(),
    direccion: text("direccion").notNull(),
    cantidad: numeric("cantidad", { precision: 15, scale: 3 }).notNull(),
    stockLocalAntes: numeric("stock_local_antes", {
      precision: 15,
      scale: 3,
    }).notNull(),
    stockLocalDespues: numeric("stock_local_despues", {
      precision: 15,
      scale: 3,
    }).notNull(),
    stockBodegaAntes: numeric("stock_bodega_antes", {
      precision: 15,
      scale: 3,
    }).notNull(),
    stockBodegaDespues: numeric("stock_bodega_despues", {
      precision: 15,
      scale: 3,
    }).notNull(),
    stockActualAntes: numeric("stock_actual_antes", {
      precision: 15,
      scale: 3,
    }).notNull(),
    stockActualDespues: numeric("stock_actual_despues", {
      precision: 15,
      scale: 3,
    }).notNull(),
    observacion: text("observacion"),
    creadoEn: timestamp("creado_en").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "movimientos_inventario_producto_id_fk",
      columns: [table.productoId],
      foreignColumns: [productosTable.id],
    }),
    index("movimientos_inventario_producto_fecha_idx").on(
      table.productoId,
      table.creadoEn,
    ),
    index("movimientos_inventario_operation_id_idx").on(table.operationId),
  ],
);

export type MovimientoInventario =
  typeof movimientosInventarioTable.$inferSelect;
