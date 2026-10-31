import type { RequestHandler } from "express";
import { pool } from "@workspace/db";

const METODOS_MUTACION = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Serializa reintentos simultáneos del mismo operationId en una conexión DB. */
export const bloqueoOperacion: RequestHandler = async (req, res, next) => {
  const operationId = req.header("x-operation-id");
  if (!operationId || !METODOS_MUTACION.has(req.method)) {
    next();
    return;
  }

  const client = await pool.connect();
  let liberado = false;
  let bloqueoAdquirido = false;
  const liberar = () => {
    if (liberado) return;
    liberado = true;
    if (!bloqueoAdquirido) {
      client.release();
      return;
    }
    void client
      .query("SELECT pg_advisory_unlock(hashtext($1))", [operationId])
      .catch((error) =>
        console.error("No se pudo liberar el bloqueo de operación:", error),
      )
      .finally(() => client.release());
  };
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [operationId]);
    bloqueoAdquirido = true;

    const operacionAnterior = await client.query<{ respuesta_remota: unknown }>(
      "SELECT respuesta_remota FROM eventos_sincronizacion WHERE operation_id = $1 LIMIT 1",
      [operationId],
    );
    const respuestaAnterior = operacionAnterior.rows[0]?.respuesta_remota;
    if (
      respuestaAnterior &&
      typeof respuestaAnterior === "object" &&
      "statusCode" in respuestaAnterior &&
      typeof respuestaAnterior.statusCode === "number" &&
      "body" in respuestaAnterior
    ) {
      liberar();
      if (
        "contentType" in respuestaAnterior &&
        typeof respuestaAnterior.contentType === "string"
      ) {
        res.setHeader("Content-Type", respuestaAnterior.contentType);
      }
      res.status(respuestaAnterior.statusCode).send(respuestaAnterior.body);
      return;
    }

    let responseBody: unknown;
    let capturedResponse = false;
    const originalJson = res.json.bind(res);
    res.json = ((body?: unknown) => {
      responseBody = body ?? null;
      capturedResponse = true;
      return originalJson(body);
    }) as typeof res.json;

    const originalSend = res.send.bind(res);
    res.send = ((body?: unknown) => {
      if (!capturedResponse) {
        responseBody =
          typeof Buffer !== "undefined" && Buffer.isBuffer(body)
            ? body.toString("utf8")
            : body ?? null;
        capturedResponse = true;
      }
      return originalSend(body);
    }) as typeof res.send;

    let guardandoRespuesta = false;
    const guardarRespuesta = async () => {
      if (guardandoRespuesta) return;
      guardandoRespuesta = true;
      try {
        if (
          res.statusCode >= 200 &&
          res.statusCode < 300 &&
          (capturedResponse || res.statusCode === 204)
        ) {
          const contentType = res.getHeader("Content-Type");
          const respuesta = {
            statusCode: res.statusCode,
            contentType:
              typeof contentType === "string" ? contentType : null,
            body: capturedResponse ? responseBody : null,
          };
          await client.query(
            `INSERT INTO eventos_sincronizacion (
              operation_id, entidad, entidad_id, tipo, metodo, endpoint,
              payload, origen, estado, respuesta_remota, procesado_en
            ) VALUES ($1, 'api', $2, $3, $3, $4, $5::jsonb,
              'api_idempotente', 'sincronizado', $6::jsonb, NOW())
            ON CONFLICT (operation_id) DO UPDATE
            SET respuesta_remota = EXCLUDED.respuesta_remota,
              procesado_en = EXCLUDED.procesado_en`,
            [
              operationId,
              req.path,
              req.method,
              req.originalUrl.replace(/^\/api/, ""),
              JSON.stringify(req.body ?? {}),
              JSON.stringify(respuesta),
            ],
          );
        }
      } catch (error) {
        console.error("No se pudo conservar la respuesta idempotente:", error);
      } finally {
        liberar();
      }
    };
    res.once("finish", () => void guardarRespuesta());
    res.once("close", () => void guardarRespuesta());
    next();
  } catch (error) {
    liberar();
    next(error);
  }
};