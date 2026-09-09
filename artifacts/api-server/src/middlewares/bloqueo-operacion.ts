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
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [operationId]);
    let liberado = false;
    const liberar = () => {
      if (liberado) return;
      liberado = true;
      client.release();
    };
    res.once("finish", () => {
      liberar();
    });
    res.once("close", () => {
      liberar();
    });
    next();
  } catch (error) {
    client.release();
    next(error);
  }
};