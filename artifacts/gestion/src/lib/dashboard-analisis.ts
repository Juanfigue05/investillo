export const CLAVE_PRODUCTOS_ALERTA_COLAPSADOS = "dashboard-productos-alerta-colapsados";

type RangoFechas = { desde: string; hasta: string };
type AlmacenamientoLocal = Pick<Storage, "getItem" | "setItem">;

export function obtenerRangoMes(mes: string): RangoFechas | null {
  const coincidencia = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!coincidencia) return null;

  const anio = Number(coincidencia[1]);
  const numeroMes = Number(coincidencia[2]);
  if (anio < 1 || numeroMes < 1 || numeroMes > 12) return null;

  const esBisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
  const diasPorMes = [31, esBisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return {
    desde: `${mes}-01`,
    hasta: `${mes}-${String(diasPorMes[numeroMes - 1]).padStart(2, "0")}`,
  };
}

export function obtenerRangoAnio(anio: number): RangoFechas | null {
  if (!Number.isInteger(anio) || anio < 1 || anio > 9999) return null;
  const anioTexto = String(anio).padStart(4, "0");
  return { desde: `${anioTexto}-01-01`, hasta: `${anioTexto}-12-31` };
}

export function sumarVentasResumen(
  ventas: readonly { totalVentas: number }[] | undefined,
): number {
  return Math.round((ventas ?? []).reduce((total, dia) => total + dia.totalVentas, 0) * 100) / 100;
}

export function leerProductosAlertaColapsados(
  almacenamiento: AlmacenamientoLocal = localStorage,
): boolean {
  try {
    const valor = almacenamiento.getItem(CLAVE_PRODUCTOS_ALERTA_COLAPSADOS);
    return valor === null || valor === "true";
  } catch (error) {
    console.warn("No se pudo leer el estado de Productos Agotándose.", error);
    return true;
  }
}

export function guardarProductosAlertaColapsados(
  colapsados: boolean,
  almacenamiento: AlmacenamientoLocal = localStorage,
): void {
  try {
    almacenamiento.setItem(CLAVE_PRODUCTOS_ALERTA_COLAPSADOS, String(colapsados));
  } catch (error) {
    console.warn("No se pudo guardar el estado de Productos Agotándose.", error);
  }
}
