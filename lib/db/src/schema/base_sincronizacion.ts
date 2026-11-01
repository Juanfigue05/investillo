import { bigint, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const TABLAS_HUELLA = [
  "productos",
  "clientes",
  "vehiculos_cliente",
  "creditos",
  "credito_lineas",
  "abonos_creditos",
  "ventas_diarias",
  "compras",
  "trabajadores",
  "pagos_seguro",
  "mano_obra",
  "distribuciones_mano_obra",
  "grupos_trabajo_default",
  "descuentos_inventario",
  "historial_precios",
  "obra_electronica",
  "remachadas",
  "tensionadas",
  "notas",
  "historial_dias",
  "cierre_diario",
] as const;

export type TablaHuella = (typeof TABLAS_HUELLA)[number];

export const baseSincronizacionTable = pgTable("base_sincronizacion", {
  tabla: text("tabla").primaryKey(),
  total: bigint("total", { mode: "bigint" }).notNull(),
  maximoId: bigint("maximo_id", { mode: "bigint" }).notNull(),
  creadoEn: timestamp("creado_en").defaultNow().notNull(),
});
