import { randomUUID } from "node:crypto";
import "../lib/solo-base-de-pruebas";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { pool } from "@workspace/db";
import syncRouter from "./sync";

const app = express();
app.use(express.json());
app.use("/api/sync", syncRouter);

const prefix = `sync-route-test-${randomUUID()}`;
let acuseAnterior: { valor: string; operacion_id: string | null } | undefined;

async function insertarEvento(
  operationId: string,
  fecha: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO eventos_sincronizacion
      (operation_id, entidad, entidad_id, tipo, metodo, endpoint, payload,
       origen, estado, creado_en)
     VALUES ($1, 'test', '1', 'crear', 'POST', '/test', '{}'::jsonb,
       'remoto', 'sincronizado', $2::timestamp)`,
    [operationId, fecha],
  );
}

beforeAll(async () => {
  await pool.query(
    "ALTER TABLE cursos_sincronizacion ADD COLUMN IF NOT EXISTS operacion_id text",
  );
  const anterior = await pool.query<{
    valor: string;
    operacion_id: string | null;
  }>(
    `SELECT valor::text AS valor, operacion_id
       FROM cursos_sincronizacion WHERE nombre = 'acuse_local'`,
  );
  acuseAnterior = anterior.rows[0];
  await pool.query(
    "DELETE FROM cursos_sincronizacion WHERE nombre = 'acuse_local'",
  );
});

afterAll(async () => {
  await pool.query(
    "DELETE FROM eventos_sincronizacion WHERE operation_id LIKE $1",
    [`${prefix}%`],
  );
  await pool.query(
    "DELETE FROM cursos_sincronizacion WHERE nombre = 'acuse_local'",
  );
  if (acuseAnterior) {
    await pool.query(
      `INSERT INTO cursos_sincronizacion (nombre, valor, operacion_id)
       VALUES ('acuse_local', $1::timestamp, $2)`,
      [acuseAnterior.valor, acuseAnterior.operacion_id],
    );
  }
});

describe.sequential("Rutas de sincronización", () => {
  it("valida desde y limita la entrega a eventos con más de dos segundos", async () => {
    for (const desde of [
      "ayer",
      "2026-02-31 12:00:00",
      "2000-01-01 00:00:00; DROP TABLE eventos_sincronizacion",
    ]) {
      await request(app).get("/api/sync/pull").query({ desde }).expect(400);
    }

    const [fechaPrueba] = await pool
      .query<{ fecha: string; desde: string }>(
        `SELECT
         to_char(now() - interval '10 seconds', 'YYYY-MM-DD HH24:MI:SS.US') AS fecha,
         to_char(now() - interval '10 seconds' - interval '1 microsecond',
                 'YYYY-MM-DD HH24:MI:SS.US') AS desde`,
      )
      .then((result) => result.rows);
    expect(fechaPrueba).toBeDefined();
    await pool.query(
      `INSERT INTO eventos_sincronizacion
        (operation_id, entidad, entidad_id, tipo, metodo, endpoint, payload,
         origen, estado, creado_en)
       VALUES
        ($1, 'test', '1', 'crear', 'POST', '/test', '{}'::jsonb,
         'remoto', 'sincronizado', $3::timestamp),
        ($2, 'test', '2', 'crear', 'POST', '/test', '{}'::jsonb,
         'remoto', 'sincronizado', now() - interval '1 second')`,
      [`${prefix}-old`, `${prefix}-new`, fechaPrueba!.fecha],
    );

    const respuesta = await request(app)
      .get("/api/sync/pull")
      .query({ desde: fechaPrueba!.desde, limite: "200" })
      .expect(200);
    const ids = respuesta.body.eventos.map(
      (evento: { operationId: string }) => evento.operationId,
    );
    expect(ids).toContain(`${prefix}-old`);
    expect(ids).not.toContain(`${prefix}-new`);
  });

  it("pagina por fecha y operation_id sin duplicar empates y recorta el límite a 200", async () => {
    const [fechaGrupo] = await pool
      .query<{ fecha: string; desde: string }>(
        `SELECT
         to_char(now() - interval '10 seconds', 'YYYY-MM-DD HH24:MI:SS.US') AS fecha,
         to_char(now() - interval '10 seconds' - interval '1 microsecond',
                 'YYYY-MM-DD HH24:MI:SS.US') AS desde`,
      )
      .then((result) => result.rows);
    expect(fechaGrupo).toBeDefined();
    const idsEmpate = [`${prefix}-tie-a`, `${prefix}-tie-b`, `${prefix}-tie-c`];
    for (const id of idsEmpate) await insertarEvento(id, fechaGrupo!.fecha);

    const primera = await request(app)
      .get("/api/sync/pull")
      .query({ desde: fechaGrupo!.desde, limite: "2" })
      .expect(200);
    const idsPrimera = primera.body.eventos
      .map((evento: { operationId: string }) => evento.operationId)
      .filter((id: string) => idsEmpate.includes(id));
    expect(idsPrimera).toEqual(idsEmpate.slice(0, 2));
    expect(primera.body.hayMas).toBe(true);

    const segunda = await request(app)
      .get("/api/sync/pull")
      .query({
        desde: primera.body.hasta,
        desdeOperacion: primera.body.hastaOperacion,
        limite: "2",
      })
      .expect(200);
    const idsSegunda = segunda.body.eventos
      .map((evento: { operationId: string }) => evento.operationId)
      .filter((id: string) => idsEmpate.includes(id));
    expect(idsSegunda).toEqual([idsEmpate[2]]);
    expect(segunda.body.hayMas).toBe(false);
    expect(new Set([...idsPrimera, ...idsSegunda]).size).toBe(3);

    const [fechaLote] = await pool
      .query<{ fecha: string; desde: string }>(
        `SELECT
         to_char(now() - interval '10 seconds', 'YYYY-MM-DD HH24:MI:SS.US') AS fecha,
         to_char(now() - interval '10 seconds' - interval '1 microsecond',
                 'YYYY-MM-DD HH24:MI:SS.US') AS desde`,
      )
      .then((result) => result.rows);
    await pool.query(
      `INSERT INTO eventos_sincronizacion
        (operation_id, entidad, entidad_id, tipo, metodo, endpoint, payload,
         origen, estado, creado_en)
       SELECT $1 || '-' || lpad(numero::text, 3, '0'),
              'test', '1', 'crear', 'POST', '/test', '{}'::jsonb,
              'remoto', 'sincronizado', $2::timestamp
         FROM generate_series(1, 205) AS numero`,
      [`${prefix}-limit`, fechaLote!.fecha],
    );
    const limitada = await request(app)
      .get("/api/sync/pull")
      .query({ desde: fechaLote!.desde, limite: "500" })
      .expect(200);
    expect(limitada.body.eventos).toHaveLength(200);
    expect(limitada.body.hayMas).toBe(true);

    const limiteInvalido = await request(app)
      .get("/api/sync/pull")
      .query({ desde: fechaLote!.desde, limite: "no-es-numero" })
      .expect(200);
    expect(limiteInvalido.body.eventos).toHaveLength(100);
  });

  it("devuelve ahora con microsegundos y valida el acuse sin retroceder", async () => {
    const ahora = await request(app).get("/api/sync/ahora").expect(200);
    expect(ahora.body.ahora).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/,
    );

    const [fechaEvento] = await pool
      .query<{ fecha: string }>(
        `SELECT to_char(
         now() - interval '10 seconds',
         'YYYY-MM-DD HH24:MI:SS.US'
       ) AS fecha`,
      )
      .then((result) => result.rows);
    await insertarEvento(`${prefix}-ack`, fechaEvento!.fecha);
    const [maximo] = await pool
      .query<{ fecha: string; posterior: string; futuro: string }>(
        `SELECT
         to_char(max(creado_en), 'YYYY-MM-DD HH24:MI:SS.US') AS fecha,
         to_char(max(creado_en) + interval '1 second',
                 'YYYY-MM-DD HH24:MI:SS.US') AS posterior,
         to_char(now() + interval '1 minute',
                 'YYYY-MM-DD HH24:MI:SS.US') AS futuro
       FROM eventos_sincronizacion WHERE origen = 'remoto'`,
      )
      .then((result) => result.rows);
    expect(maximo).toBeDefined();

    await request(app)
      .post("/api/sync/ack")
      .send({ hasta: maximo!.futuro })
      .expect(400);
    await request(app)
      .post("/api/sync/ack")
      .send({ hasta: maximo!.posterior })
      .expect(400);
    await request(app)
      .post("/api/sync/ack")
      .send({ hasta: maximo!.fecha })
      .expect(200);
    const ackGuardado = await pool.query<{ valor: string }>(
      `SELECT to_char(valor, 'YYYY-MM-DD HH24:MI:SS.US') AS valor
         FROM cursos_sincronizacion WHERE nombre = 'acuse_local'`,
    );
    await request(app)
      .post("/api/sync/ack")
      .send({ hasta: "2000-01-01 00:00:00" })
      .expect(200);
    const ackSinRetroceso = await pool.query<{ valor: string }>(
      `SELECT to_char(valor, 'YYYY-MM-DD HH24:MI:SS.US') AS valor
         FROM cursos_sincronizacion WHERE nombre = 'acuse_local'`,
    );
    expect(ackSinRetroceso.rows[0]?.valor).toBe(ackGuardado.rows[0]?.valor);
  });

  it("detecta endpoints iguales y subrutas posteriores al cursor", async () => {
    const [marcas] = await pool.query<{
      desde: string;
      anterior: string;
      reciente: string;
      recienteExacta: string;
    }>(
      `SELECT
         to_char(now() - interval '1 second', 'YYYY-MM-DD HH24:MI:SS.US') AS desde,
         to_char(now() - interval '2 seconds', 'YYYY-MM-DD HH24:MI:SS.US') AS anterior,
         to_char(now() - interval '100 milliseconds', 'YYYY-MM-DD HH24:MI:SS.US') AS reciente,
         to_char(now() - interval '100 milliseconds', 'YYYY-MM-DD HH24:MI:SS.US') AS "recienteExacta"`,
    ).then((result) => result.rows);
    expect(marcas).toBeDefined();
    const operationIds = [
      `${prefix}-a-credit-abono`,
      `${prefix}-b-credit-50`,
      `${prefix}-client-query`,
      `${prefix}-older`,
      `${prefix}-cursor-b`,
      `${prefix}-wildcard`,
    ];
    await pool.query(
      `INSERT INTO eventos_sincronizacion
        (operation_id, entidad, entidad_id, tipo, metodo, endpoint, payload,
         origen, estado, creado_en)
       VALUES
        ($1, 'credito', '5', 'editar', 'PUT', '/creditos/5/abono?origen=remoto', '{}'::jsonb,
         'remoto', 'sincronizado', $2::timestamp),
        ($3, 'credito', '50', 'editar', 'PUT', '/creditos/50', '{}'::jsonb,
         'remoto', 'sincronizado', $4::timestamp),
        ($5, 'cliente', '55', 'editar', 'PUT', '/clientes/55?origen=remoto', '{}'::jsonb,
         'remoto', 'sincronizado', $6::timestamp),
        ($7, 'producto', '9', 'editar', 'PUT', '/productos/9', '{}'::jsonb,
         'remoto', 'sincronizado', $8::timestamp),
        ($9, 'credito', '6', 'editar', 'PUT', '/creditos/6/detalle', '{}'::jsonb,
         'remoto', 'sincronizado', $10::timestamp),
        ($11, 'test', '1', 'editar', 'PUT', '/items/aX/detalle', '{}'::jsonb,
         'remoto', 'sincronizado', $12::timestamp)`,
      [
        operationIds[0],
        marcas!.reciente,
        operationIds[1],
        marcas!.reciente,
        operationIds[2],
        marcas!.reciente,
        operationIds[3],
        marcas!.anterior,
        operationIds[4],
        marcas!.recienteExacta,
        operationIds[5],
        marcas!.reciente,
      ],
    );

    const subruta = await request(app)
      .get("/api/sync/conflicto")
      .query({
        desde: marcas!.desde,
        endpoint: "/creditos/5",
      })
      .expect(200);
    expect(subruta.body.conflicto).toBe(true);
    expect(subruta.body.evento).toMatchObject({
      operationId: operationIds[0],
      metodo: "PUT",
      endpoint: "/creditos/5/abono?origen=remoto",
    });
    expect(subruta.body.evento.creadoEn).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/,
    );

    const subcadenaNoValida = await request(app)
      .get("/api/sync/conflicto")
      .query({
        desde: marcas!.recienteExacta,
        desdeOperacion: operationIds[0],
        endpoint: "/creditos/5",
      })
      .expect(200);
    expect(subcadenaNoValida.body.conflicto).toBe(false);

    const endpointConConsulta = await request(app)
      .get("/api/sync/conflicto")
      .query({
        desde: marcas!.desde,
        endpoint: "/clientes/55?x=1",
      })
      .expect(200);
    expect(endpointConConsulta.body.conflicto).toBe(true);
    expect(endpointConConsulta.body.evento.operationId).toBe(operationIds[2]);

    const subrutaConBarraFinal = await request(app)
      .get("/api/sync/conflicto")
      .query({
        desde: marcas!.desde,
        endpoint: "/creditos/5/",
      })
      .expect(200);
    expect(subrutaConBarraFinal.body.conflicto).toBe(true);

    const anterior = await request(app)
      .get("/api/sync/conflicto")
      .query({
        desde: marcas!.desde,
        endpoint: "/productos/9",
      })
      .expect(200);
    expect(anterior.body.conflicto).toBe(false);

    const cursorCompuesto = await request(app)
      .get("/api/sync/conflicto")
      .query({
        desde: marcas!.recienteExacta,
        desdeOperacion: `${prefix}-cursor-a`,
        endpoint: "/creditos/6",
      })
      .expect(200);
    expect(cursorCompuesto.body.conflicto).toBe(true);
    expect(cursorCompuesto.body.evento.operationId).toBe(operationIds[4]);

    const sinCoincidenciaWildcards = await request(app)
      .get("/api/sync/conflicto")
      .query({
        desde: marcas!.desde,
        endpoint: "/items/a_",
      })
      .expect(200);
    expect(sinCoincidenciaWildcards.body.conflicto).toBe(false);

    for (const query of [
      { endpoint: "/ventas/1" },
      { desde: "ayer", endpoint: "/ventas/1" },
      { desde: marcas!.desde, endpoint: "ventas/1" },
      { desde: marcas!.desde, endpoint: `/${"x".repeat(500)}` },
      {
        desde: marcas!.desde,
        desdeOperacion: "",
        endpoint: "/ventas/1",
      },
      {
        desde: marcas!.desde,
        endpoint: "/ventas/1",
        entidad: "venta",
      },
      {
        desde: marcas!.desde,
        endpoint: "/ventas/1",
        entidadId: "1",
      },
    ]) {
      await request(app).get("/api/sync/conflicto").query(query).expect(400);
    }
  });
});
