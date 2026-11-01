import type pg from "pg";
import { TABLAS_HUELLA } from "@workspace/db/schema";

export const MENSAJE_PUNTO_PARTIDA_AUSENTE =
  "Falta el punto de partida. Si es una instalación de pruebas, reinicia borrando el cursor (`DELETE FROM cursos_sincronizacion WHERE nombre = 'remoto';`) y ejecuta `pnpm run sync:init` con las dos bases alineadas.";

export async function verificarPuntoPartida(pool: pg.Pool): Promise<void> {
  try {
    const resultado = await pool.query<{ tabla: string }>(
      "SELECT tabla FROM base_sincronizacion",
    );
    const guardadas = new Set(resultado.rows.map((fila) => fila.tabla));
    if (TABLAS_HUELLA.some((tabla) => !guardadas.has(tabla))) {
      throw new Error(MENSAJE_PUNTO_PARTIDA_AUSENTE);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === MENSAJE_PUNTO_PARTIDA_AUSENTE
    ) {
      throw error;
    }
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "42P01"
    ) {
      throw new Error(MENSAJE_PUNTO_PARTIDA_AUSENTE);
    }
    throw error;
  }
}
