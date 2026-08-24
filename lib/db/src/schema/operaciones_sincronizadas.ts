import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

/** Registra qué operaciones offline ya se procesaron, para nunca duplicarlas si llegan 2 veces */
export const operacionesSincronizadasTable = pgTable("operaciones_sincronizadas", {
  operationId: text("operation_id").primaryKey(),
  tipo: text("tipo").notNull(),
  recursoId: integer("recurso_id"),
  creadoEn: timestamp("creado_en").defaultNow(),
});