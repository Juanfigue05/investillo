import assert from "node:assert/strict";
import test from "node:test";
import { getRemoteApiUrl } from "../remote-api-url";
import {
  endpointDeRecuperacion,
  idsLineaPendiente,
  idsLineaCreditoEnPayload,
  idPrincipalDeRespuesta,
  relacionesDeRespuesta,
  resolverEndpointConReferencias,
  traducirIdCreditoEnEndpoint,
  traducirIdRecursoEnEndpoint,
  traducirIdsLineaCredito,
  valorEnRuta,
} from "./credito-lineas-sync";

test("calcula la ruta de recuperación para reintentos de creación de crédito", () => {
  assert.equal(
    endpointDeRecuperacion("POST", "/creditos", "/creditos", 42),
    "/creditos/42",
  );
  assert.equal(
    endpointDeRecuperacion("POST", "/creditos", "/creditos", undefined),
    "/creditos",
  );
  assert.equal(
    endpointDeRecuperacion("PUT", "/creditos/5", "/creditos/5", 42),
    "/creditos/5",
  );
  assert.equal(
    endpointDeRecuperacion("POST", "/ventas", "/ventas", 42),
    "/ventas",
  );
  assert.equal(
    endpointDeRecuperacion("POST", "/creditos?origen=local", "/creditos?origen=local", 42),
    "/creditos/42",
  );
});

test("resuelve rutas anidadas en respuestas de crédito", () => {
  assert.equal(
    valorEnRuta({ lineas: [{ id: 8 }, { id: 12 }] }, "lineas.1.id"),
    12,
  );
});

test("selecciona el ID principal según la entidad de sincronización", () => {
  const respuesta = {
    id: 101,
    _syncNuevoAbonoId: 202,
    recursoId: 303,
  };

  assert.equal(idPrincipalDeRespuesta("credito", respuesta), 101);
  assert.equal(idPrincipalDeRespuesta("abono_credito", respuesta), 202);
  assert.equal(idPrincipalDeRespuesta("venta", { recursoId: 303 }), 303);
  assert.equal(idPrincipalDeRespuesta("credito", null), undefined);
});

test("empareja las líneas creadas al editar un crédito", () => {
  const relaciones = relacionesDeRespuesta(
    [
      {
        campo: "lineas.1.id",
        entidad: "credito_linea",
        valorLocal: "21",
      },
    ],
    { id: 4, lineas: [{ id: 6 }, { id: 82 }] },
    "local",
  );

  assert.deepEqual(relaciones, [
    { entidad: "credito_linea", idLocal: "21", idRemoto: "82" },
  ]);
});

test("crea la relación inversa al bajar una edición remota", () => {
  const relaciones = relacionesDeRespuesta(
    [
      {
        campo: "lineas.0.id",
        entidad: "credito_linea",
        valorLocal: "91",
      },
    ],
    { lineas: [{ id: 17 }] },
    "remoto",
  );

  assert.deepEqual(relaciones, [
    { entidad: "credito_linea", idLocal: "17", idRemoto: "91" },
  ]);
});

test("mantiene la orientación local/remoto al guardar IDs divergentes", () => {
  const referencia = [{
    campo: "id",
    entidad: "credito",
    valorLocal: "101",
  }];

  assert.deepEqual(
    relacionesDeRespuesta(referencia, { id: 501 }, "local"),
    [{ entidad: "credito", idLocal: "101", idRemoto: "501" }],
  );
  assert.deepEqual(
    relacionesDeRespuesta(
      [{ ...referencia[0]!, valorLocal: "901" }],
      { id: 201 },
      "remoto",
    ),
    [{ entidad: "credito", idLocal: "201", idRemoto: "901" }],
  );
});

test("traduce IDs de líneas en ediciones de crédito y abonos", () => {
  const relaciones = new Map([["21", "82"]]);

  assert.deepEqual(
    traducirIdsLineaCredito(
      { lineas: [{ id: 21 }, { id: 22 }] },
      "/creditos/3",
      relaciones,
    ),
    { lineas: [{ id: 82 }, { id: 22 }] },
  );
  assert.deepEqual(
    traducirIdsLineaCredito(
      { lineas: [{ lineaId: "21", valor: 5000 }] },
      "/creditos/{creditoId}/abono",
      relaciones,
    ),
    { lineas: [{ lineaId: "82", valor: 5000 }] },
  );
  assert.deepEqual(
    idsLineaCreditoEnPayload(
      { lineas: [{ lineaId: 21 }, { lineaId: 22 }] },
      "/creditos/3/abono",
    ),
    ["21", "22"],
  );
});

test("no permite usar una línea que aún espera su relación de sincronización", () => {
  assert.deepEqual(
    idsLineaPendiente(
      ["21", "22", "23"],
      new Map([["22", "82"]]),
      new Set(["21", "23"]),
    ),
    ["21", "23"],
  );
});

test("traduce el crédito en la ruta y deja intactas otras rutas", () => {
  const relaciones = new Map([["3", "7"]]);
  assert.equal(
    traducirIdCreditoEnEndpoint("/creditos/3/abono?x=1", relaciones),
    "/creditos/7/abono?x=1",
  );
  assert.equal(
    traducirIdCreditoEnEndpoint("/creditos/{creditoId}/abono", relaciones),
    "/creditos/{creditoId}/abono",
  );
  assert.equal(
    traducirIdCreditoEnEndpoint("/ventas/3", relaciones),
    "/ventas/3",
  );
});

test("resuelve rutas relacionadas al sincronizar en sentido inverso", () => {
  assert.equal(
    resolverEndpointConReferencias(
      "/clientes/{clienteId}/vehiculos/{id}",
      [
        {
          marcador: "{clienteId}",
          entidad: "cliente",
          valorLocal: "81",
        },
      ],
      new Map([["cliente:81", "14"]]),
    ),
    "/clientes/14/vehiculos/{id}",
  );
  assert.equal(
    resolverEndpointConReferencias(
      "/clientes/81/vehiculos/7",
      [
        {
          marcador: "{clienteId}",
          entidad: "cliente",
          valorLocal: "81",
        },
      ],
      new Map([["cliente:81", "14"]]),
    ),
    "/clientes/14/vehiculos/7",
  );
  assert.throws(
    () =>
      resolverEndpointConReferencias(
        "/clientes/{clienteId}/vehiculos/{id}",
        [
          {
            marcador: "{clienteId}",
            entidad: "cliente",
            valorLocal: "81",
          },
        ],
        new Map(),
      ),
    /Referencia sin resolver/,
  );
});

test("solo permite HTTP en loopback con autorización explícita de pruebas", () => {
  const originalUrl = process.env.SYNC_REMOTE_API_URL;
  const originalAllowHttp = process.env.SYNC_TEST_ALLOW_LOCAL_HTTP;
  try {
    process.env.SYNC_REMOTE_API_URL = "http://127.0.0.1:4100/api";
    delete process.env.SYNC_TEST_ALLOW_LOCAL_HTTP;
    assert.throws(() => getRemoteApiUrl(), /debe usar HTTPS/);

    process.env.SYNC_TEST_ALLOW_LOCAL_HTTP = "true";
    assert.equal(getRemoteApiUrl(), "http://127.0.0.1:4100/api");

    process.env.SYNC_REMOTE_API_URL = "http://example.test/api";
    assert.throws(() => getRemoteApiUrl(), /debe usar HTTPS/);
  } finally {
    if (originalUrl === undefined) delete process.env.SYNC_REMOTE_API_URL;
    else process.env.SYNC_REMOTE_API_URL = originalUrl;
    if (originalAllowHttp === undefined) {
      delete process.env.SYNC_TEST_ALLOW_LOCAL_HTTP;
    } else {
      process.env.SYNC_TEST_ALLOW_LOCAL_HTTP = originalAllowHttp;
    }
  }
});

test("traduce el ID del recurso final sin alterar otros segmentos", () => {
  assert.equal(
    traducirIdRecursoEnEndpoint("/productos/52?vista=1", "52", "103"),
    "/productos/103?vista=1",
  );
  assert.equal(
    traducirIdRecursoEnEndpoint("/creditos/52/abono", "52", "103"),
    "/creditos/52/abono",
  );
});
