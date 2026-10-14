import { describe, expect, it } from "vitest";
import {
  calculatePaymentAllocations,
  getMaximumPayment,
  orderAllocationsByCreditLines,
  readDailyIvaPreference,
} from "@workspace/api-zod";

describe("distribución de pagos de crédito", () => {
  it("completa todas las líneas cuando se paga el saldo total", () => {
    const balances = [
      { lineId: 1, remaining: 120 },
      { lineId: 2, remaining: 80 },
    ];

    expect(calculatePaymentAllocations(200, [1, 2], balances)).toEqual([
      { lineId: 1, value: 120 },
      { lineId: 2, value: 80 },
    ]);
  });

  it("deja el abono parcial únicamente en el último producto seleccionado", () => {
    const balances = [
      { lineId: 1, remaining: 120 },
      { lineId: 2, remaining: 80 },
    ];

    expect(calculatePaymentAllocations(150, [1, 2], balances)).toEqual([
      { lineId: 1, value: 120 },
      { lineId: 2, value: 30 },
    ]);
  });

  it("rechaza montos que obligarían a dejar parcial un producto anterior al último", () => {
    const balances = [
      { lineId: 1, remaining: 120 },
      { lineId: 2, remaining: 80 },
    ];

    expect(calculatePaymentAllocations(100, [1, 2], balances)).toEqual([]);
  });

  it("guarda las ventas en el orden original del crédito, no en orden de clic", () => {
    const allocations = [
      { lineaId: 9, valor: 30 },
      { lineaId: 4, valor: 120 },
    ];

    expect(orderAllocationsByCreditLines(allocations, [4, 9])).toEqual([
      { lineaId: 4, valor: 120 },
      { lineaId: 9, valor: 30 },
    ]);
  });

  it("calcula el máximo de edición solo dentro del crédito seleccionado", () => {
    expect(getMaximumPayment(900, 300, 100)).toBe(700);
    expect(getMaximumPayment(900, 300)).toBe(600);
  });

  it("solo activa la pregunta de IVA cuando el perfil lo habilitó", () => {
    const preferences = new Map([
      ["investillo-perfil", "administrador"],
      ["investillo-preferencias-administrador", JSON.stringify({ incluirIvaVentasDiarias: true })],
    ]);
    expect(readDailyIvaPreference({ getItem: (key) => preferences.get(key) ?? null })).toBe(true);
    expect(readDailyIvaPreference({ getItem: () => null })).toBe(false);
  });
});
