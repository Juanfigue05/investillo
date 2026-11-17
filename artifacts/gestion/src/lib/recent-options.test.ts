import { describe, expect, it } from "vitest";
import {
  cargarIdsRecientes,
  guardarIdReciente,
  ordenarOpcionesConPrioridad,
  ordenarOpcionesRecientes,
} from "./recent-options";

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

describe("opciones usadas recientemente", () => {
  it("guarda solo los identificadores recientes y promueve el último usado", () => {
    const storage = almacenamientoFalso();
    const ids = guardarIdReciente("productos", "17", ["12", "17"], storage);

    expect(ids).toEqual(["17", "12"]);
    expect(cargarIdsRecientes("productos", storage)).toEqual(["17", "12"]);
  });

  it("ordena opciones recientes primero sin descartar las demás", () => {
    expect(ordenarOpcionesRecientes(
      [{ id: "1" }, { id: "2" }, { id: "3" }],
      ["3", "1"],
    )).toEqual([{ id: "3" }, { id: "1" }, { id: "2" }]);
  });

  it("mantiene las opciones prioritarias al inicio antes de las recientes", () => {
    expect(ordenarOpcionesConPrioridad(
      [
        { id: "servicio-1", alwaysFirst: true },
        { id: "producto-1" },
        { id: "servicio-2", alwaysFirst: true },
        { id: "producto-2" },
      ],
      ["producto-2", "producto-1"],
      true,
    ).map(({ id }) => id)).toEqual([
      "servicio-1",
      "servicio-2",
      "producto-2",
      "producto-1",
    ]);
  });

  it("permite recordar clientes por identificador sin guardar el nombre", () => {
    expect(ordenarOpcionesRecientes(
      [{ id: "Ana Pérez", recentId: "8" }, { id: "Luis", recentId: "4" }],
      ["4"],
    )).toEqual([{ id: "Luis", recentId: "4" }, { id: "Ana Pérez", recentId: "8" }]);
  });
});
