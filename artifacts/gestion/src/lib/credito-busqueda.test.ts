import { describe, expect, it } from "vitest";
import {
  buscarCreditoDuplicadoPorReferencia,
  coincideBusquedaCredito,
} from "./credito-busqueda";

const credito = {
  nombreCliente: "Taller El Éxito",
  concepto: "FAC-2026-0048",
  telefonoCliente: "300 123 4567",
  placaVehiculo: "ABC123",
};

describe("búsqueda de créditos", () => {
  it("encuentra créditos por referencia de factura, sin distinguir mayúsculas", () => {
    expect(coincideBusquedaCredito(credito, "fac-2026-0048")).toBe(true);
    expect(coincideBusquedaCredito(credito, "0048")).toBe(true);
  });

  it("conserva búsqueda por nombre, teléfono y placa", () => {
    expect(coincideBusquedaCredito(credito, "taller el exito")).toBe(true);
    expect(coincideBusquedaCredito(credito, "300123")).toBe(true);
    expect(coincideBusquedaCredito(credito, "abc123")).toBe(true);
  });

  it("advierte duplicados por referencia y cliente, respetando ediciones", () => {
    const registros = [
      { id: 3, concepto: "FAC-12", nombreCliente: "Taller Éxito" },
      { id: 4, concepto: "FAC-12", nombreCliente: "Otro cliente" },
    ];

    expect(buscarCreditoDuplicadoPorReferencia(registros, "fac-12", "taller exito")?.id).toBe(3);
    expect(buscarCreditoDuplicadoPorReferencia(registros, "FAC-12", "Taller Éxito", 3)).toBeUndefined();
  });
});
