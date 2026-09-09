import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";

/** Registro durable de cambios que pueden repetirse durante una sincronización. */
export const eventosSincronizacionTable = pgTable(
  "eventos_sincronizacion",
  {
    operationId: text("operation_id").primaryKey(),
    entidad: text("entidad").notNull(),
    entidadId: text("entidad_id").notNull(),
    tipo: text("tipo").notNull(),
    metodo: text("metodo").notNull(),
    endpoint: text("endpoint").notNull(),
    payload: jsonb("payload").notNull(),
    origen: text("origen").notNull(),
    estado: text("estado").notNull().default("pendiente"),
    intentos: integer("intentos").notNull().default(0),
    ultimoError: text("ultimo_error"),
    respuestaRemota: jsonb("respuesta_remota"),
    creadoEn: timestamp("creado_en").defaultNow().notNull(),
    procesadoEn: timestamp("procesado_en"),
  },
  (table) => ({
    entidadCreadaIndex: index("eventos_sincronizacion_entidad_creada_idx").on(
      table.entidad,
      table.entidadId,
      table.creadoEn,
    ),
  }),
);

export type EventoSincronizacion = typeof eventosSincronizacionTable.$inferSelect;
export type InsertEventoSincronizacion = typeof eventosSincronizacionTable.$inferInsert;