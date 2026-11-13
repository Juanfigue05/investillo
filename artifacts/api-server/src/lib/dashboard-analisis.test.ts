import { describe, expect, it } from "vitest";
import { obtenerRangoMesCreditos, resumirCreditosMes } from "./dashboard-analisis";

describe("resumen mensual de créditos del dashboard", () => {
  it("valida el mes y calcula correctamente sus días", () => {
    expect(obtenerRangoMesCreditos("2024-02")).toEqual({ desde: "2024-02-01", hasta: "2024-02-29" });
    expect(obtenerRangoMesCreditos("2026-11")).toEqual({ desde: "2026-11-01", hasta: "2026-11-30" });
    expect(obtenerRangoMesCreditos("2026-00")).toBeNull();
  });

  it("incluye los créditos pagados en el total y excluye sus saldos del pendiente", () => {
    expect(resumirCreditosMes([
      { valorCredito: "100.50", valorAbonado: "100.50" },
      { valorCredito: "250", valorAbonado: "50" },
      { valorCredito: 10, valorAbonado: 12 },
    ])).toEqual({
      totalCreditosMes: 360.5,
      saldoPendienteMes: 200,
      cantidadCreditosMes: 3,
      cantidadPendientesMes: 1,
    });
  });
});
