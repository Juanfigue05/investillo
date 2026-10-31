import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const cursosSincronizacionTable = pgTable("cursos_sincronizacion", {
  nombre: text("nombre").primaryKey(),
  valor: timestamp("valor").notNull(),
  operacionId: text("operacion_id"),
  actualizadoEn: timestamp("actualizado_en").defaultNow().notNull(),
});
