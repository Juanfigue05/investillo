import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TABLAS_HUELLA } from "@workspace/db/schema";
import {
  ENTIDADES_SIN_TABLA,
  ENTIDAD_TABLA,
  REGLAS_REFERENCIAS,
  TABLAS_SIN_ENTIDAD,
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

test("cada tabla y entidad referenciada tiene un destino de huella", () => {
  const destinos = [...new Set(Object.values(ENTIDAD_TABLA))];
  const excepciones = Object.keys(TABLAS_SIN_ENTIDAD);
  assert.deepEqual(
    destinos.filter((tabla) => excepciones.includes(tabla)),
    [],
  );
  assert.deepEqual(
    [...destinos, ...excepciones].sort(),
    [...TABLAS_HUELLA].sort(),
  );
  const entidadesUsadas = new Set(
    REGLAS_REFERENCIAS.flatMap((regla) => [
      ...regla.campos.map((campo) => campo.entidad),
      ...(regla.segmentos ?? []).map((segmento) => segmento.entidad),
    ]),
  );
  for (const entidad of entidadesUsadas) {
    assert.ok(
      entidad in ENTIDAD_TABLA || entidad in ENTIDADES_SIN_TABLA,
      `La entidad ${entidad} no tiene tabla ni excepción documentada`,
    );
  }
});

test("traduce el parámetro de producto independiente de la entidad del evento", () => {
  const regla = encontrarRegla(
    "DELETE",
    "/historial-precios/producto/12",
  );
  assert.ok(regla);
  assert.deepEqual(regla.segmentos, [
    { parametro: "productoId", entidad: "producto" },
  ]);
  assert.deepEqual(resolverEndpoint("/historial-precios/producto/12", "12", "99", 3), {
    endpoint: "/historial-precios/producto/99",
    cambiado: true,
  });
  assert.deepEqual(resolverEndpoint("/historial-precios/producto/12", "12", "99", 2), {
    endpoint: "/historial-precios/producto/12",
    cambiado: false,
  });
});

test("cada emisor del manifiesto tiene una regla específica de método y endpoint", () => {
  const clavesReglas = REGLAS_REFERENCIAS.flatMap((regla) =>
    (typeof regla.metodo === "string" ? [regla.metodo] : regla.metodo).map(
      (metodo) => `${metodo} ${regla.endpoint}`,
    ),
  );
  assert.equal(new Set(clavesReglas).size, clavesReglas.length);

  const documento = readFileSync(
    new URL("../../../docs/referencias-sincronizacion.md", import.meta.url),
    "utf8",
  );
  const bloque = documento.match(
    /<!-- sync-emitters:start -->([\s\S]*?)<!-- sync-emitters:end -->/,
  )?.[1];
  assert.ok(bloque, "Falta el manifiesto delimitado en el inventario");
  const emisores = bloque
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter((linea) => /^[A-Z]+ \//.test(linea));
  assert.ok(emisores.length > 0, "El manifiesto no enumera emisores");
  for (const emisor of emisores) {
    const [metodo, endpoint] = emisor.split(" ", 2);
    assert.ok(
      metodo && endpoint && encontrarRegla(metodo, endpoint),
      `El emisor ${emisor} no tiene regla`,
    );
  }
});
