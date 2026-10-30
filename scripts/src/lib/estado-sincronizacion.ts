import type { TablaHuella } from "@workspace/db/schema";

export type EstadoBaseSincronizacion = {
  estado: "ausente" | "incompleto" | "completo";
  faltantes: TablaHuella[];
};

export type ResumenEstadoSincronizacion = {
  tablasEsperadas: readonly TablaHuella[];
  tablasGuardadas: readonly string[];
  cursor?: { valor: string; operacionId: string | null };
  eventos: readonly {
    origen: string;
    estado: string;
    cantidad: number;
  }[];
  eventosAnteriores: number | null;
  totalEventos: number;
};

export function evaluarEstadoBase(
  tablasEsperadas: readonly TablaHuella[],
  tablasGuardadas: readonly string[],
): EstadoBaseSincronizacion {
  const guardadas = new Set(tablasGuardadas);
  const faltantes = tablasEsperadas.filter((tabla) => !guardadas.has(tabla));
  return {
    estado:
      tablasGuardadas.length === 0
        ? "ausente"
        : faltantes.length === 0
          ? "completo"
          : "incompleto",
    faltantes,
  };
}

export function formatearEstadoSincronizacion(
  resumen: ResumenEstadoSincronizacion,
): string {
  const estadoBase = evaluarEstadoBase(
    resumen.tablasEsperadas,
    resumen.tablasGuardadas,
  );
  const lineas = [
    `Punto de partida: ${estadoBase.estado} (${resumen.tablasGuardadas.length}/${resumen.tablasEsperadas.length} tablas)`,
  ];
  if (estadoBase.faltantes.length > 0) {
    lineas.push(`Tablas faltantes: ${estadoBase.faltantes.join(", ")}`);
  }
  lineas.push(
    resumen.cursor
      ? `Cursor remoto: ${resumen.cursor.valor} (operacion_id: ${resumen.cursor.operacionId ?? "ninguno"})`
      : "Cursor remoto: no existe",
    "Eventos por origen y estado:",
  );
  if (resumen.eventos.length === 0) {
    lineas.push("- ninguno");
  } else {
    for (const evento of resumen.eventos) {
      lineas.push(`- ${evento.origen}/${evento.estado}: ${evento.cantidad}`);
    }
  }
  if (resumen.eventosAnteriores === null) {
    lineas.push(
      "Eventos anteriores al punto de partida: no determinable (no existe fecha de huella base).",
    );
    if (resumen.totalEventos > 0) {
      lineas.push(
        "AVISO: hay eventos y no se puede descartar que sean anteriores al reinicio; verifica el estado antes de sincronizar.",
      );
    }
  } else {
    lineas.push(
      `Eventos anteriores al punto de partida: ${resumen.eventosAnteriores}`,
    );
    if (resumen.eventosAnteriores > 0) {
      lineas.push(
        "AVISO: hay eventos anteriores a la huella base; verifica si pertenecen a una instalación previa antes de sincronizar.",
      );
    }
  }
  return lineas.join("\n");
}
