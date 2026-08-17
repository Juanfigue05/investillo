import { pgTable, serial, text, numeric, timestamp, date, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const creditosTable = pgTable("creditos", {
  id: serial("id").primaryKey(),
  /** 'credito' | 'nosdebe' */
  tipo: text("tipo").notNull().default("credito"),
  /** No. Remisión / referencia — obligatorio para tipo='credito', null para 'nosdebe' */
  concepto: text("concepto"),
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

export const creditoLineasTable = pgTable("credito_lineas", {
  id: serial("id").primaryKey(),
  creditoId: integer("credito_id").notNull(),
  productoId: integer("producto_id"),
  cantidad: numeric("cantidad", { precision: 15, scale: 3 }).notNull(),
  productoNombre: text("producto_nombre").notNull(),
  productoCodigo: text("producto_codigo"),
  productoMarca: text("producto_marca"),
  /** Precio de venta unitario al momento de crear el crédito (no cambia aunque el inventario cambie) */
  precioVenta: numeric("precio_venta", { precision: 15, scale: 2 }).notNull(),
  /** Precio de compra unitario al momento de crear el crédito */
  precioCompra: numeric("precio_compra", { precision: 15, scale: 2 }).notNull().default("0"),
  valorAbonado: numeric("valor_abonado", { precision: 15, scale: 2 }).notNull().default("0"),
});

/** Historial de pagos/abonos a un crédito (para auditoría) */
export const abonosCreditosTable = pgTable("abonos_creditos", {
  id: serial("id").primaryKey(),
  creditoId: integer("credito_id").notNull(),
  fecha: date("fecha").notNull(),
  valorTotal: numeric("valor_total", { precision: 15, scale: 2 }).notNull(),
  notas: text("notas"),
  /** JSON: [{lineaId, valor}] — detalle por línea para poder revertir exactamente */
  lineaDetalle: text("linea_detalle"),
  creadoEn: timestamp("creado_en").defaultNow(),
});

export const insertCreditoSchema = createInsertSchema(creditosTable).omit({ id: true, creadoEn: true, actualizadoEn: true });
export const insertCreditoLineaSchema = createInsertSchema(creditoLineasTable).omit({ id: true });
export const insertAbonoCreditoSchema = createInsertSchema(abonosCreditosTable).omit({ id: true, creadoEn: true });
export type InsertCredito = z.infer<typeof insertCreditoSchema>;
export type InsertCreditoLinea = z.infer<typeof insertCreditoLineaSchema>;
export type InsertAbonoCredito = z.infer<typeof insertAbonoCreditoSchema>;
export type Credito = typeof creditosTable.$inferSelect;
export type CreditoLinea = typeof creditoLineasTable.$inferSelect;
export type AbonoCredito = typeof abonosCreditosTable.$inferSelect;
