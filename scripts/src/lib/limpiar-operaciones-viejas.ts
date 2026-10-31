import type { PoolClient } from "pg";

export async function limpiarEventosSincronizadosAntiguos(
  pool: Pick<PoolClient, "query">,
  diasAConservar: number,
): Promise<number> {
  const resultado = await pool.query(
    `DELETE FROM eventos_sincronizacion
     WHERE estado = 'sincronizado'
       AND procesado_en < now() - make_interval(days => $1)
       AND (
         origen <> 'remoto'
         OR creado_en <= (
           SELECT valor
             FROM cursos_sincronizacion
            WHERE nombre = 'acuse_local'
         )
       )`,
    [diasAConservar],
  );
  return resultado.rowCount ?? 0;
}
