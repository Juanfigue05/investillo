import assert from "node:assert/strict";
import test from "node:test";
import {
  encontrarRegla,
  extraerReferencias,
  resolverEndpoint,
  traducirPayload,
  type ReglaReferencias,
} from "./referencias-payload";

test("encuentra reglas por método y segmentos completos, ignorando la consulta", () => {
  assert.equal(encontrarRegla("POST", "/ventas")?.endpoint, "/ventas");
  assert.equal(
    encontrarRegla("post", "/ventas?origen=local")?.endpoint,
    "/ventas",
  );
  assert.equal(encontrarRegla("PUT", "/ventas/12")?.endpoint, "/ventas/:id");
  assert.equal(
    encontrarRegla("POST", "/ventas/12/trasladar")?.endpoint,
    "/ventas/:id/trasladar",
  );
  assert.equal(encontrarRegla("PUT", "/ventas/12/trasladar"), undefined);
  assert.equal(
    encontrarRegla("PUT", "/ventas/reordenar")?.endpoint,
    "/ventas/reordenar",
  );
  assert.equal(
    encontrarRegla("PUT", "/creditos/reordenar")?.endpoint,
    "/creditos/reordenar",
  );
  const reglaCierre = encontrarRegla("POST", "/cierre-diario")!;
  assert.deepEqual(
    extraerReferencias(reglaCierre, {
      datos: [{ trabajadorId: 7 }],
    }),
    [{ entidad: "trabajador", valorLocal: "7" }],
  );
  assert.deepEqual(
    extraerReferencias(reglaCierre, {
      datos: { trabajadores: [{ trabajadorId: 8 }] },
    }),
    [{ entidad: "trabajador", valorLocal: "8" }],
  );
  assert.equal(encontrarRegla("DELETE", "/ventas"), undefined);
});

test("extrae IDs de arreglos anidados y elimina referencias duplicadas", () => {
  const regla: ReglaReferencias = {
    metodo: "PUT",
    endpoint: "/ventas/:id",
    campos: [
      { ruta: "distribuciones[].trabajadorId", entidad: "trabajador" },
      { ruta: "trabajadorIds[]", entidad: "trabajador" },
      { ruta: "items[].productoId", entidad: "producto" },
    ],
  };
  assert.deepEqual(
    extraerReferencias(regla, {
      distribuciones: [
        { trabajadorId: 7 },
        { trabajadorId: "7" },
        { trabajadorId: 9 },
      ],
      trabajadorIds: [9, 10],
      items: [{ productoId: 3 }, { productoId: 3 }],
    }),
    [
      { entidad: "trabajador", valorLocal: "7" },
      { entidad: "trabajador", valorLocal: "9" },
      { entidad: "trabajador", valorLocal: "10" },
      { entidad: "producto", valorLocal: "3" },
    ],
  );
});

test("traduce referencias anidadas sin mutar el original y conserva el tipo", () => {
  const regla: ReglaReferencias = {
    metodo: "PUT",
    endpoint: "/ventas/:id",
    campos: [
      { ruta: "items[].productoId", entidad: "producto" },
      { ruta: "distribuciones[].trabajadorId", entidad: "trabajador" },
    ],
  };
  const original = {
    items: [{ productoId: 12 }, { productoId: "13" }, { productoId: 14 }],
    distribuciones: [{ trabajadorId: "5" }],
  };
  const traducido = traducirPayload(
    regla,
    original,
    new Map([
      ["producto:12", "120"],
      ["producto:13", "130"],
      ["trabajador:5", "50"],
    ]),
  ) as typeof original;

  assert.deepEqual(traducido, {
    items: [{ productoId: 120 }, { productoId: "130" }, { productoId: 14 }],
    distribuciones: [{ trabajadorId: "50" }],
  });
  assert.notEqual(traducido, original);
  assert.notEqual(traducido.items, original.items);
  assert.notEqual(traducido.items[0], original.items[0]);
  assert.deepEqual(original, {
    items: [{ productoId: 12 }, { productoId: "13" }, { productoId: 14 }],
    distribuciones: [{ trabajadorId: "5" }],
  });
});

test("deja iguales IDs sin relación remota y omite valores null o vacíos", () => {
  const regla: ReglaReferencias = {
    metodo: "POST",
    endpoint: "/grupos-trabajo",
    campos: [
      { ruta: "trabajadorIds[]", entidad: "trabajador" },
      { ruta: "items[].productoId", entidad: "producto" },
    ],
  };
  const payload = {
    trabajadorIds: [null, "", "  ", 8],
    items: [{ productoId: null }, { productoId: "" }, { productoId: "9" }],
  };
  assert.deepEqual(extraerReferencias(regla, payload), [
    { entidad: "trabajador", valorLocal: "8" },
    { entidad: "producto", valorLocal: "9" },
  ]);
  assert.deepEqual(traducirPayload(regla, payload, new Map()), payload);
});

test("resuelve solo segmentos iguales al ID local y conserva la consulta", () => {
  assert.deepEqual(resolverEndpoint("/ventas/12", "1", "99"), {
    endpoint: "/ventas/12",
    cambiado: false,
  });
  assert.deepEqual(resolverEndpoint("/ventas/1?x=1", "1", "99"), {
    endpoint: "/ventas/99?x=1",
    cambiado: true,
  });
});
