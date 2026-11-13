import { describe, expect, it } from "vitest";
import {
  agregarSugerenciaReciente,
  cargarSugerenciasRecientes,
  cargarTrabajadoresRecientes,
  filtrarTrabajadoresPorNombre,
  guardarSugerenciaReciente,
  guardarTrabajadoresRecientes,
  ordenarPorUsoReciente,
} from "./sugerencias-obra";

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

describe("sugerencias recientes de obra electrónica", () => {
  it("promueve el valor nuevo y elimina duplicados sin distinguir mayúsculas", () => {
    expect(agregarSugerenciaReciente(["FAC-2", "FAC-1"], " fac-1 "))
      .toEqual(["fac-1", "FAC-2"]);
  });

  it("no agrega entradas vacías y limita la lista a ocho valores", () => {
    const actuales = Array.from({ length: 8 }, (_, indice) => `V-${indice}`);
    expect(agregarSugerenciaReciente(actuales, "   ")).toBe(actuales);
    expect(agregarSugerenciaReciente(actuales, "V-NUEVO")).toHaveLength(8);
    expect(agregarSugerenciaReciente(actuales, "V-NUEVO")[0]).toBe("V-NUEVO");
  });

  it("persiste valores y conserva primero los trabajadores usados más recientemente", () => {
    const almacenamiento = almacenamientoFalso();
    expect(guardarSugerenciaReciente("facturas", "F-100", [], almacenamiento)).toEqual(["F-100"]);
    expect(cargarSugerenciasRecientes("facturas", almacenamiento)).toEqual(["F-100"]);
    expect(guardarTrabajadoresRecientes([3, 1], [1, 2], almacenamiento)).toEqual([3, 1, 2]);
    expect(cargarTrabajadoresRecientes(almacenamiento)).toEqual([3, 1, 2]);
    expect(ordenarPorUsoReciente(
      [{ id: 1 }, { id: 2 }, { id: 3 }],
      [3, 1],
    )).toEqual([{ id: 3 }, { id: 1 }, { id: 2 }]);
  });

  it("filtra trabajadores por nombre sin distinguir mayúsculas ni espacios externos", () => {
    expect(filtrarTrabajadoresPorNombre(
      [{ nombre: "Ana Pérez" }, { nombre: "Luis Gómez" }],
      "  perez ",
    )).toEqual([{ nombre: "Ana Pérez" }]);
  });
});
