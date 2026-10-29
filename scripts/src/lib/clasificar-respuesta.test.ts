import assert from "node:assert/strict";
import test from "node:test";
import { clasificarRespuesta } from "./clasificar-respuesta";

test("interrumpe ante fallos de red y errores temporales del servidor", () => {
  for (const codigo of [null, 502, 503, 504]) {
    assert.equal(clasificarRespuesta(codigo, 0), "INTERRUMPIR");
  }
});

test("rechaza la llave ante 401, 403 y 429", () => {
  for (const codigo of [401, 403, 429]) {
    assert.equal(clasificarRespuesta(codigo, 0), "LLAVE_RECHAZADA");
  }
});

test("clasifica 409 como rechazo definitivo", () => {
  assert.equal(clasificarRespuesta(409, 0), "RECHAZO_DEFINITIVO");
});

test("reintenta 5xx dos veces y marca error en el tercer fallo", () => {
  for (const codigo of [500, 501, 505]) {
    assert.equal(clasificarRespuesta(codigo, 0), "REINTENTAR");
    assert.equal(clasificarRespuesta(codigo, 1), "REINTENTAR");
    assert.equal(clasificarRespuesta(codigo, 2), "ERROR");
    assert.equal(clasificarRespuesta(codigo, 3), "ERROR");
  }
});

test("marca otros errores 4xx como error", () => {
  for (const codigo of [400, 404, 422]) {
    assert.equal(clasificarRespuesta(codigo, 0), "ERROR");
  }
});
