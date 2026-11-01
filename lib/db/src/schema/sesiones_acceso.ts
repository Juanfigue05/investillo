import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const sesionesAccesoTable = pgTable("sesiones_acceso", {
  tokenHash: text("token_hash").primaryKey(),
  creadoEn: timestamp("creado_en", { withTimezone: true })
    .defaultNow()
    .notNull(),
  expiraEn: timestamp("expira_en", { withTimezone: true }).notNull(),
});
