import assert from "node:assert/strict";
import test from "node:test";
import { leerRespuestaApi } from "./respuesta-api";

test("devuelve el contenido de una respuesta exitosa", async () => {
  const result = await leerRespuestaApi<{ ok: boolean }>(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
  assert.deepEqual(result, { ok: true });
});

test("usa el mensaje del servidor en conflictos 409", async () => {
  await assert.rejects(
    leerRespuestaApi(new Response(JSON.stringify({ error: "La llegada ya fue procesada." }), { status: 409 })),
    { message: "La llegada ya fue procesada." },
  );
});

test("ofrece un mensaje claro para una solicitud 400 sin error del servidor", async () => {
  await assert.rejects(
    leerRespuestaApi(new Response("{}", { status: 400 })),
    { message: "Los datos enviados no son válidos. Revísalos e inténtalo de nuevo." },
  );
});

test("ofrece un mensaje claro para un error 500 sin cuerpo JSON", async () => {
  await assert.rejects(
    leerRespuestaApi(new Response("error", { status: 500 })),
    { message: "El servidor tuvo un problema al guardar. Inténtalo más tarde." },
  );
});

test("traduce fallos de red", async () => {
  await assert.rejects(
    leerRespuestaApi(Promise.reject(new TypeError("fetch failed"))),
    { message: "No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo." },
  );
});
