import { describe, expect, it } from "vitest";
import {
  crearRegistrosBusquedaGlobal,
  filtrarBusquedaGlobal,
} from "./busqueda-global";

describe("búsqueda global de registros", () => {
  it("encuentra créditos por factura, clientes por placa y trabajadores por nombre", () => {
    const registros = crearRegistrosBusquedaGlobal({
      creditos: [{ id: 1, nombreCliente: "Taller Éxito", concepto: "FAC-19", placaVehiculo: "ABC123", valorCredito: 100, valorAbonado: 25 }],
      clientes: [{ id: 2, nombre: "Ana Pérez", telefono: "300123", vehiculos: [{ placa: "XYZ456" }] }],
      trabajadores: [{ id: 3, nombre: "José Gómez", telefono: "310000" }],
    });

    expect(filtrarBusquedaGlobal(registros, "fac-19")[0]?.categoria).toBe("Crédito");
    expect(filtrarBusquedaGlobal(registros, "xyz456")[0]?.categoria).toBe("Cliente");
    expect(filtrarBusquedaGlobal(registros, "300123")[0]?.categoria).toBe("Cliente");
    expect(filtrarBusquedaGlobal(registros, "jose gomez")[0]?.categoria).toBe("Trabajador");
  });

  it("limita resultados por categoría", () => {
    const registros = crearRegistrosBusquedaGlobal({
      creditos: Array.from({ length: 8 }, (_, id) => ({
        id,
        nombreCliente: `Cliente ${id}`,
        concepto: `FACTURA-${id}`,
      })),
      clientes: [],
      trabajadores: [],
    });

    expect(filtrarBusquedaGlobal(registros, "factura", 3)).toHaveLength(3);
  });
});
