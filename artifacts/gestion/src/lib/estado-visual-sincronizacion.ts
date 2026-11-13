export function describirEstadoSincronizacion(
  enLinea: boolean,
  pendientes: number,
  errores: number,
) {
  const label = errores > 0
    ? `${errores} operación${errores === 1 ? "" : "es"} necesita${errores === 1 ? "" : "n"} atención · ${pendientes} sin sincronizar`
    : pendientes > 0
      ? `${pendientes} operación${pendientes === 1 ? "" : "es"} pendiente${pendientes === 1 ? "" : "s"} de sincronizar`
      : enLinea
        ? "Sincronizado"
        : "Sin conexión · los cambios nuevos se guardarán localmente";
  const tono = errores > 0
    ? "error"
    : !enLinea || pendientes > 0
      ? "pendiente"
      : "correcto";
  return { label, tono };
}
