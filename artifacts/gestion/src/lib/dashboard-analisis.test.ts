import { describe, expect, it } from "vitest";
import {
  CLAVE_PRODUCTOS_ALERTA_COLAPSADOS,
  guardarProductosAlertaColapsados,
  leerProductosAlertaColapsados,
  obtenerRangoAnio,
  obtenerRangoMes,
  sumarVentasResumen,
} from "./dashboard-analisis";

function almacenamientoFalso(): Storage {
  const valores = new Map<string, string>();
  return {
    getItem: (clave) => valores.get(clave) ?? null,
    setItem: (clave, valor) => { valores.set(clave, valor); },
    removeItem: (clave) => { valores.delete(clave); },
    clear: () => { valores.clear(); },
    key: (indice) => [...valores.keys()][indice] ?? null,
    get length() { return valores.size; },
  };
}

describe("análisis del dashboard", () => {
  it("calcula rangos mensuales incluyendo años bisiestos", () => {
    expect(obtenerRangoMes("2024-02")).toEqual({ desde: "2024-02-01", hasta: "2024-02-29" });
    expect(obtenerRangoMes("2026-02")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
    expect(obtenerRangoMes("2026-13")).toBeNull();
  });

  it("limita el resumen anual únicamente a las fechas del año seleccionado", () => {
    expect(obtenerRangoAnio(2027)).toEqual({ desde: "2027-01-01", hasta: "2027-12-31" });
    expect(obtenerRangoAnio(0)).toBeNull();
    expect(sumarVentasResumen([{ totalVentas: 150.25 }, { totalVentas: 49.75 }])).toBe(200);
  });

  it("inicia Productos Agotándose contraído y recuerda la preferencia del usuario", () => {
    const almacenamiento = almacenamientoFalso();
    expect(leerProductosAlertaColapsados(almacenamiento)).toBe(true);
    guardarProductosAlertaColapsados(false, almacenamiento);
    expect(almacenamiento.getItem(CLAVE_PRODUCTOS_ALERTA_COLAPSADOS)).toBe("false");
    expect(leerProductosAlertaColapsados(almacenamiento)).toBe(false);
  });
});
