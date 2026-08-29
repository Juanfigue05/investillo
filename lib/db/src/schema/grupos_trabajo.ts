import { pgTable, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";

/** Grupos de trabajadores que reparten su mano de obra por igual, de forma permanente hasta que se desactiven */
export const gruposTrabajoDefaultTable = pgTable("grupos_trabajo_default", {
  id: serial("id").primaryKey(),
  trabajadorIds: integer("trabajador_ids").array().notNull(),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamp("creado_en").defaultNow(),
});