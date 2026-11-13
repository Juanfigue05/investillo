import { describe, expect, it } from "vitest";
import {
  cargarIdsRecientes,
  guardarIdReciente,
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

  it("permite recordar clientes por identificador sin guardar el nombre", () => {
    expect(ordenarOpcionesRecientes(
      [{ id: "Ana Pérez", recentId: "8" }, { id: "Luis", recentId: "4" }],
      ["4"],
    )).toEqual([{ id: "Luis", recentId: "4" }, { id: "Ana Pérez", recentId: "8" }]);
  });
});
