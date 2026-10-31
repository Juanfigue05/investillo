import "../lib/solo-base-de-pruebas";
import { randomUUID } from "node:crypto";
import express from "express";
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { pool } from "@workspace/db";
import { capturarCambiosRemotos } from "./capturar-cambios-remotos";
import { bloqueoOperacion } from "./bloqueo-operacion";
import syncRouter from "../routes/sync";

const operationIds = new Set<string>();

function crearId(): string {
  const id = `orden18-${randomUUID()}`;
  operationIds.add(id);
  return id;
}

async function limpiarDatos(): Promise<void> {
  const ids = [...operationIds];
  if (ids.length === 0) return;
  await pool.query(
    "DELETE FROM eventos_sincronizacion WHERE operation_id = ANY($1::text[])",
    [ids],
  );
  await pool.query(
    "DELETE FROM operaciones_sincronizadas WHERE operation_id = ANY($1::text[])",
    [ids],
  );
}

afterAll(async () => {
  await limpiarDatos();
});

describe("middleware de bloqueo por operation id", () => {
  it("repite estado, tipo de contenido y cuerpo de una respuesta exitosa", async () => {
    const operationId = crearId();
    let ejecuciones = 0;
    const app = express();
    app.use(bloqueoOperacion);
    app.post("/success", (_req, res) => {
      ejecuciones += 1;
      res.status(201).json({ id: operationId, creado: true });
    });

    const primera = await request(app)
      .post("/success")
      .set("X-Operation-Id", operationId)
      .expect(201);
    const repetida = await request(app)
      .post("/success")
      .set("X-Operation-Id", operationId)
      .expect(201);

    expect(repetida.headers["content-type"]).toBe(
      primera.headers["content-type"],
    );
    expect(repetida.body).toEqual(primera.body);
    expect(ejecuciones).toBe(1);
  });

  it.each([400, 500])(
    "no guarda ni repite respuestas HTTP %i",
    async (statusCode) => {
      const operationId = crearId();
      let ejecuciones = 0;
      const app = express();
      app.use(bloqueoOperacion);
      app.post("/error", (_req, res) => {
        ejecuciones += 1;
        res.status(statusCode).json({ error: "No se guardó" });
      });

      for (let intento = 0; intento < 2; intento += 1) {
        await request(app)
          .post("/error")
          .set("X-Operation-Id", operationId)
          .expect(statusCode);
      }

      const eventos = await pool.query(
        "SELECT 1 FROM eventos_sincronizacion WHERE operation_id = $1",
        [operationId],
      );
      expect(ejecuciones).toBe(2);
      expect(eventos.rowCount).toBe(0);
    },
  );

  it("solo actualiza la respuesta al encontrar un evento pendiente existente", async () => {
    const operationId = crearId();
    const app = express();
    app.use(bloqueoOperacion);
    app.post("/pending", (_req, res) => {
      res.status(200).json({ guardado: true });
    });
    await pool.query(
      `INSERT INTO eventos_sincronizacion
        (operation_id, entidad, entidad_id, tipo, metodo, endpoint, payload,
         origen, estado)
       VALUES ($1, 'test', '/pending', 'POST', 'POST', '/pending', '{}'::jsonb,
         'local', 'pendiente')`,
      [operationId],
    );

    await request(app)
      .post("/pending")
      .set("X-Operation-Id", operationId)
      .expect(200);
    await request(app)
      .post("/pending")
      .set("X-Operation-Id", operationId)
      .expect(200);

    const evento = await pool.query<{
      origen: string;
      estado: string;
      procesado_en: Date | null;
      respuesta_remota: unknown;
    }>(
      `SELECT origen, estado, procesado_en, respuesta_remota
         FROM eventos_sincronizacion WHERE operation_id = $1`,
      [operationId],
    );
    expect(evento.rows[0]).toMatchObject({
      origen: "local",
      estado: "pendiente",
      procesado_en: null,
      respuesta_remota: {
        statusCode: 200,
        body: { guardado: true },
      },
    });
  });

  it("serializa dos solicitudes simultáneas y conserva un solo registro", async () => {
    const operationId = crearId();
    let ejecuciones = 0;
    let solicitudesRecibidas = 0;
    let resolverDosSolicitudes!: () => void;
    let resolverHandler!: () => void;
    let resolverHandlerIniciado!: () => void;
    const dosSolicitudes = new Promise<void>((resolve) => {
      resolverDosSolicitudes = resolve;
    });
    const liberarHandler = new Promise<void>((resolve) => {
      resolverHandler = resolve;
    });
    const handlerIniciado = new Promise<void>((resolve) => {
      resolverHandlerIniciado = resolve;
    });

    const app = express();
    app.use((req, _res, next) => {
      if (req.header("x-operation-id") === operationId) {
        solicitudesRecibidas += 1;
        if (solicitudesRecibidas === 2) resolverDosSolicitudes();
      }
      next();
    });
    app.use(bloqueoOperacion);
    app.post("/success", async (_req, res) => {
      ejecuciones += 1;
      await pool.query(
        `INSERT INTO operaciones_sincronizadas (operation_id, tipo, recurso_id)
         VALUES ($1, 'orden18_test', 1)`,
        [operationId],
      );
      resolverHandlerIniciado();
      await liberarHandler;
      res.status(201).json({ id: operationId, creado: true });
    });

    const primera = request(app)
      .post("/success")
      .set("X-Operation-Id", operationId);
    const segunda = request(app)
      .post("/success")
      .set("X-Operation-Id", operationId);
    const respuestas = Promise.all([primera, segunda]);
    await Promise.all([dosSolicitudes, handlerIniciado]);
    resolverHandler();
    const [respuestaPrimera, respuestaSegunda] = await respuestas;

    expect(respuestaPrimera.status).toBe(201);
    expect(respuestaSegunda.status).toBe(201);
    expect(respuestaSegunda.body).toEqual(respuestaPrimera.body);
    expect(ejecuciones).toBe(1);

    const [eventos, operaciones] = await Promise.all([
      pool.query(
        "SELECT 1 FROM eventos_sincronizacion WHERE operation_id = $1",
        [operationId],
      ),
      pool.query(
        "SELECT 1 FROM operaciones_sincronizadas WHERE operation_id = $1",
        [operationId],
      ),
    ]);
    expect(eventos.rowCount).toBe(1);
    expect(operaciones.rowCount).toBe(1);
  });

  it("mantiene los eventos idempotentes fuera de la sincronización y de los pendientes", async () => {
    const operationId = crearId();
    const app = express();
    app.use(bloqueoOperacion);
    app.post("/success", (_req, res) => {
      res.status(201).json({ id: operationId, creado: true });
    });
    app.use("/api/sync", syncRouter);

    await request(app)
      .post("/success")
      .set("X-Operation-Id", operationId)
      .expect(201);
    await request(app)
      .post("/success")
      .set("X-Operation-Id", operationId)
      .expect(201);
    await pool.query(
      `UPDATE eventos_sincronizacion
          SET creado_en = now() - interval '10 seconds'
        WHERE operation_id = $1`,
      [operationId],
    );

    const pull = await request(app)
      .get("/api/sync/pull")
      .query({ desde: "1970-01-01 00:00:00" })
      .expect(200);
    const pushPendientes = await pool.query(
      `SELECT operation_id FROM eventos_sincronizacion
        WHERE operation_id = $1 AND estado IN ('pendiente', 'error')
        ORDER BY creado_en ASC LIMIT 50`,
      [operationId],
    );
    const estadoPorOrigen = await pool.query<{
      origen: string;
      estado: string;
      cantidad: number;
    }>(
      `SELECT origen, estado, count(*)::int AS cantidad
         FROM eventos_sincronizacion
        WHERE operation_id = $1
        GROUP BY origen, estado`,
      [operationId],
    );
    const estadoPendientes = await pool.query(
      `SELECT count(*)::int AS cantidad FROM eventos_sincronizacion
        WHERE operation_id = $1 AND origen = 'local'
          AND estado IN ('pendiente', 'error')`,
      [operationId],
    );
    const inconsistencias = await pool.query(
      `SELECT count(*)::int AS cantidad FROM eventos_sincronizacion
        WHERE operation_id = $1 AND origen = 'local'
          AND estado IN ('error', 'conflicto', 'pendiente')`,
      [operationId],
    );
    const resumenEstado = await pool.query(
      `SELECT origen, estado FROM eventos_sincronizacion
        WHERE operation_id = $1`,
      [operationId],
    );

    expect(pull.body.eventos).not.toContainEqual(
      expect.objectContaining({ operationId }),
    );
    expect(pushPendientes.rows).not.toContainEqual(
      expect.objectContaining({ operation_id: operationId }),
    );
    expect(estadoPendientes.rows[0]?.cantidad).toBe(0);
    expect(inconsistencias.rows[0]?.cantidad).toBe(0);
    expect(resumenEstado.rows).toEqual([
      { origen: "api_idempotente", estado: "sincronizado" },
    ]);
    expect(estadoPorOrigen.rows).toEqual([
      { origen: "api_idempotente", estado: "sincronizado", cantidad: 1 },
    ]);
  });

  it("conserva origen remoto y respuesta en ambos órdenes de guardado", async () => {
    const captureSetting = process.env.SYNC_CAPTURE_REMOTE;
    process.env.SYNC_CAPTURE_REMOTE = "true";
    try {
      for (const capturaPrimero of [true, false]) {
        const operationId = crearId();
        const app = express();
        if (capturaPrimero) {
          app.use(capturarCambiosRemotos);
          app.use(bloqueoOperacion);
        } else {
          app.use(bloqueoOperacion);
          app.use(capturarCambiosRemotos);
        }
        app.post("/remote", (_req, res) => {
          res.status(201).json({ id: operationId, remoto: true });
        });

        await request(app)
          .post("/remote")
          .set("X-Operation-Id", operationId)
          .send({ operationId })
          .expect(201);

        let evento:
          | { origen: string; respuesta_remota: unknown }
          | undefined;
        for (let intento = 0; intento < 100; intento += 1) {
          const resultado = await pool.query<{
            origen: string;
            respuesta_remota: unknown;
          }>(
            `SELECT origen, respuesta_remota
               FROM eventos_sincronizacion
              WHERE operation_id = $1`,
            [operationId],
          );
          evento = resultado.rows[0];
          if (
            evento?.origen === "remoto" &&
            evento.respuesta_remota !== null
          ) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        expect(evento?.origen).toBe("remoto");
        expect(evento?.respuesta_remota).toEqual({
          statusCode: 201,
          contentType: expect.stringContaining("application/json"),
          body: { id: operationId, remoto: true },
        });
      }
    } finally {
      if (captureSetting === undefined) {
        delete process.env.SYNC_CAPTURE_REMOTE;
      } else {
        process.env.SYNC_CAPTURE_REMOTE = captureSetting;
      }
    }
  });
});
