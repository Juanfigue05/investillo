import type { RequestHandler, Response } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const METODOS_MUTACION = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const colasPorOperacion = new Map<string, Promise<void>>();

function adquirirCandado(operationId: string): Promise<() => void> {
  const anterior = colasPorOperacion.get(operationId) ?? Promise.resolve();
  let liberarTurno!: () => void;
  const turno = new Promise<void>((resolve) => {
    liberarTurno = resolve;
  });
  const cola = anterior.then(() => turno);
  colasPorOperacion.set(operationId, cola);

  return anterior.then(() => {
    let liberado = false;
    return () => {
      if (liberado) return;
      liberado = true;
      liberarTurno();
      if (colasPorOperacion.get(operationId) === cola) {
        colasPorOperacion.delete(operationId);
      }
    };
  });
}

function esRespuestaExitosa(
  respuesta: unknown,
): respuesta is {
  statusCode: number;
  contentType?: string | null;
  body: unknown;
} {
  return (
    respuesta !== null &&
    typeof respuesta === "object" &&
    "statusCode" in respuesta &&
    typeof respuesta.statusCode === "number" &&
    respuesta.statusCode >= 200 &&
    respuesta.statusCode < 300 &&
    "body" in respuesta
  );
}

function capturarRespuesta(res: Response, guardar: (respuesta: unknown) => void) {
  let cuerpo: unknown;
  let capturado = false;
  const enviarJson = res.json.bind(res);
  res.json = ((body?: unknown) => {
    cuerpo = body ?? null;
    capturado = true;
    return enviarJson(body);
  }) as typeof res.json;

  const enviar = res.send.bind(res);
  res.send = ((body?: unknown) => {
    if (!capturado) {
      cuerpo =
        typeof Buffer !== "undefined" && Buffer.isBuffer(body)
          ? body.toString("utf8")
          : body ?? null;
      capturado = true;
    }
    return enviar(body);
  }) as typeof res.send;

  return () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    if (!capturado && res.statusCode !== 204) return;
    const contentType = res.getHeader("Content-Type");
    guardar({
      statusCode: res.statusCode,
      contentType: typeof contentType === "string" ? contentType : null,
      body: capturado ? cuerpo : null,
    });
  };
}

/** El candado en memoria serializa reintentos dentro de una sola instancia del API. */
export const bloqueoOperacion: RequestHandler = async (req, res, next) => {
  const operationId = req.header("x-operation-id");
  if (!operationId || !METODOS_MUTACION.has(req.method)) {
    next();
    return;
  }

  let liberar: (() => void) | undefined;
  try {
    liberar = await adquirirCandado(operationId);
    if (res.destroyed) {
      liberar();
      return;
    }

    const operacionAnterior = await pool.query<{
      respuesta_remota: unknown;
    }>(
      "SELECT respuesta_remota FROM eventos_sincronizacion WHERE operation_id = $1 LIMIT 1",
      [operationId],
    );
    const respuestaAnterior = operacionAnterior.rows[0]?.respuesta_remota;
    if (esRespuestaExitosa(respuestaAnterior)) {
      liberar();
      if (
        typeof respuestaAnterior.contentType === "string" &&
        respuestaAnterior.contentType
      ) {
        res.setHeader("Content-Type", respuestaAnterior.contentType);
      }
      res.status(respuestaAnterior.statusCode).send(respuestaAnterior.body);
      return;
    }

    let respuestaCapturada: unknown;
    const capturar = capturarRespuesta(res, (respuesta) => {
      respuestaCapturada = respuesta;
    });
    let guardando = false;
    const terminar = async () => {
      if (guardando) return;
      guardando = true;
      try {
        if (res.writableFinished) {
          capturar();
          if (respuestaCapturada !== undefined) {
            await pool.query(
              `INSERT INTO eventos_sincronizacion (
                operation_id, entidad, entidad_id, tipo, metodo, endpoint,
                payload, origen, estado, respuesta_remota, procesado_en
              ) VALUES ($1, 'api', $2, $3, $3, $4, $5::jsonb,
                'api_idempotente', 'sincronizado', $6::jsonb, NOW())
              ON CONFLICT (operation_id) DO UPDATE
              SET respuesta_remota = EXCLUDED.respuesta_remota`,
              [
                operationId,
                req.path,
                req.method,
                req.originalUrl.replace(/^\/api/, ""),
                JSON.stringify(req.body ?? {}),
                JSON.stringify(respuestaCapturada),
              ],
            );
          }
        }
      } catch (error) {
        logger.error(
          { err: error, operationId },
          "No se pudo conservar la respuesta idempotente",
        );
      } finally {
        liberar?.();
      }
    };
    res.once("finish", () => void terminar());
    res.once("close", () => void terminar());
    next();
  } catch (error) {
    liberar?.();
    next(error);
  }
};
