import { pgTable, text, timestamp, index, primaryKey } from "drizzle-orm/pg-core";

/** Relaciona el ID serial local con el ID que asigno la base remota. */
export const referenciasSincronizacionTable = pgTable(
  "referencias_sincronizacion",
  {
    entidad: text("entidad").notNull(),
    idLocal: text("id_local").notNull(),
    idRemoto: text("id_remoto").notNull(),
    actualizadoEn: timestamp("actualizado_en").defaultNow().notNull(),
  },
  (table) => ({
    entidadLocalPrimaryKey: primaryKey({ columns: [table.entidad, table.idLocal] }),
    entidadLocalIndex: index("referencias_sincronizacion_entidad_local_idx").on(
      table.entidad,
      table.idLocal,
    ),
  }),
);