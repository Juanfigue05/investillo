import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const preferenciasUsuarioTable = pgTable("preferencias_usuario", {
  perfil: text("perfil").primaryKey(),
  nombre: text("nombre").notNull(),
  tipoUsuario: text("tipo_usuario").notNull(),
  preferencias: jsonb("preferencias").notNull().default({}),
  actualizadoEn: timestamp("actualizado_en").defaultNow(),
});
