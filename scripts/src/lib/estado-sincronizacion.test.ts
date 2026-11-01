import assert from "node:assert/strict";
import test from "node:test";
import { TABLAS_HUELLA } from "@workspace/db/schema";
import {
  evaluarEstadoBase,
  formatearEstadoSincronizacion,
} from "./estado-sincronizacion";

test("clasifica la huella del punto de partida como ausente, incompleta o completa", () => {
  assert.deepEqual(evaluarEstadoBase(TABLAS_HUELLA, []), {
    estado: "ausente",
    faltantes: [...TABLAS_HUELLA],
  });
  assert.deepEqual(
    evaluarEstadoBase(TABLAS_HUELLA, TABLAS_HUELLA.slice(1)),
    {
      estado: "incompleto",
      faltantes: [TABLAS_HUELLA[0]],
    },
  );
  assert.deepEqual(evaluarEstadoBase(TABLAS_HUELLA, TABLAS_HUELLA), {
    estado: "completo",
    faltantes: [],
  });
});

test("muestra cursor, eventos agrupados y advertencia de historia anterior", () => {
  const informe = formatearEstadoSincronizacion({
    tablasEsperadas: TABLAS_HUELLA,
    tablasGuardadas: TABLAS_HUELLA,
    cursor: {
      valor: "2026-10-30 12:00:00",
      operacionId: "op-1",
    },
    eventos: [
      { origen: "local", estado: "pendiente", cantidad: 2 },
      { origen: "remoto", estado: "sincronizado", cantidad: 5 },
    ],
    eventosAnteriores: 3,
    totalEventos: 7,
  });

  assert.match(informe, /Punto de partida: completo \(21\/21 tablas\)/);
  assert.match(informe, /Cursor remoto: 2026-10-30 12:00:00/);
  assert.match(informe, /local\/pendiente: 2/);
  assert.match(informe, /remoto\/sincronizado: 5/);
  assert.match(informe, /Eventos anteriores al punto de partida: 3/);
  assert.match(informe, /AVISO: hay eventos anteriores/);
});

test("advierte cuando no se puede determinar la antigüedad sin huella base", () => {
  const informe = formatearEstadoSincronizacion({
    tablasEsperadas: TABLAS_HUELLA,
    tablasGuardadas: [],
    cursor: { valor: "1969-12-31 19:00:00", operacionId: null },
    eventos: [{ origen: "local", estado: "pendiente", cantidad: 2 }],
    eventosAnteriores: null,
    totalEventos: 2,
  });

  assert.match(informe, /Punto de partida: ausente \(0\/21 tablas\)/);
  assert.match(informe, /Cursor remoto: 1969-12-31/);
  assert.match(informe, /no determinable/);
  assert.match(informe, /no se puede descartar que sean anteriores/);
});
