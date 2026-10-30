import type pg from "pg";

export type Referencia = {
  entidad: string;
  valorLocal: string;
};

export type EventoReferencia = {
  operation_id: string;
};

export type ResultadoClasificacionReferencia =
  | { tipo: "traducida"; valorRemoto: string }
  | { tipo: "espera" }
  | { tipo: "compartida" }
  | { tipo: "conflicto" };

export async function clasificarReferencia(
  pool: Pick<pg.Pool, "query">,
  referencia: Referencia,
  eventoActual: EventoReferencia,
  maximosIniciales: ReadonlyMap<string, string>,
  tablaEntidad: Readonly<Record<string, string>>,
): Promise<ResultadoClasificacionReferencia> {
  const mapeo = await pool.query<{ id_remoto: string }>(
    `SELECT id_remoto FROM referencias_sincronizacion
      WHERE entidad = $1 AND id_local = $2`,
    [referencia.entidad, referencia.valorLocal],
  );
  const idRemoto = mapeo.rows[0]?.id_remoto;
  if (idRemoto !== undefined) {
    return { tipo: "traducida", valorRemoto: idRemoto };
  }

  const creador = await pool.query<{ existe: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM eventos_sincronizacion
        WHERE origen = 'local'
          AND estado IN ('pendiente', 'error')
          AND metodo = 'POST'
          AND entidad = $1 AND entidad_id = $2
          AND operation_id <> $3
       UNION ALL
       SELECT 1
         FROM eventos_sincronizacion evento,
              jsonb_array_elements(COALESCE(evento.referencias_respuesta, '[]'::jsonb)) referencia
        WHERE evento.origen = 'local'
          AND evento.estado IN ('pendiente', 'error')
          AND referencia->>'entidad' = $1
          AND referencia->>'valorLocal' = $2
          AND evento.operation_id <> $3
     ) AS existe`,
    [
      referencia.entidad,
      referencia.valorLocal,
      eventoActual.operation_id,
    ],
  );
  if (creador.rows[0]?.existe) return { tipo: "espera" };

  const tabla = tablaEntidad[referencia.entidad];
  const maximoInicial = tabla ? maximosIniciales.get(tabla) : undefined;
  if (maximoInicial === undefined || !/^\d+$/.test(referencia.valorLocal)) {
    return { tipo: "conflicto" };
  }
  if (BigInt(referencia.valorLocal) <= BigInt(maximoInicial)) {
    return { tipo: "compartida" };
  }
  return { tipo: "conflicto" };
}
