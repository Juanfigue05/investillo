import "../lib/solo-base-de-pruebas";
import express from "express";
import type { ErrorRequestHandler, Express } from "express";
import pinoHttp from "pino-http";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { productosTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

let errorHandler: ErrorRequestHandler;
let app: Express;

function crearAppConError(error: unknown): Express {
  const app = express();
  app.use(pinoHttp({ logger }));
  app.use((_req, _res, next) => next(error));
  app.use(errorHandler);
  return app;
}

beforeAll(async () => {
  vi.stubEnv("CLAVE_ACCESO_REMOTO", "");
  vi.stubEnv("SYNC_TOKEN", "");
  const modulo = await import("../app");
  errorHandler = modulo.errorHandler;
  app = modulo.default;
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("errorHandler", () => {
  it("responde 500 genérico para errores sin código de duplicado", async () => {
    const response = await request(
      crearAppConError(new Error("detalle interno")),
    ).get("/");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Error interno del servidor" });
    expect(response.text).not.toContain("detalle interno");
  });

  it.each([
    ["directo", { code: "23505", detail: "detalle PostgreSQL" }],
    ["envuelto", { cause: { code: "23505", detail: "detalle PostgreSQL" } }],
  ])("traduce un error PostgreSQL %s a 409 sin filtrar detalles", async (_tipo, error) => {
    const response = await request(crearAppConError(error)).get("/");

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "Ya existe un registro con ese dato",
    });
    expect(response.text).not.toContain("detalle PostgreSQL");
  });
});

describe("duplicados de producto", () => {
  const codigo = `TEST-DUP-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  afterEach(async () => {
    await db.delete(productosTable).where(eq(productosTable.codigo, codigo));
  });

  it("responde 201 al crear y 409 al repetir el código", async () => {
    const producto = {
      nombre: "Producto duplicado de prueba",
      codigo,
      precioCompra: 100,
      precioVentaSinIva: 200,
      tieneIva: true,
      stockActual: 0,
      stockMinimo: 0,
    };

    const primero = await request(app)
      .post("/api/inventario")
      .send(producto)
      .expect(201);
    expect(primero.body.codigo).toBe(codigo);

    const repetido = await request(app)
      .post("/api/inventario")
      .send(producto)
      .expect(409);
    expect(repetido.body).toEqual({
      error: "Ya existe un registro con ese dato",
    });
  });
});
