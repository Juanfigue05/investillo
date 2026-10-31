import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const onConflictDoUpdate = vi.fn().mockResolvedValue({});
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  return { insert, values, onConflictDoUpdate };
});

vi.mock("@workspace/db", () => ({
  db: { insert: dbMocks.insert },
}));
vi.mock("@workspace/db/schema", () => ({
  eventosSincronizacionTable: {},
}));

import { capturarCambiosRemotos } from "./capturar-cambios-remotos";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("capturarCambiosRemotos", () => {
  it("omite las rutas de sincronización y captura otras rutas API", async () => {
    vi.stubEnv("SYNC_CAPTURE_REMOTE", "true");
    const app = express();
    app.use(express.json());
    app.use(capturarCambiosRemotos);
    app.post("/api/sync/ack", (_req, res) => res.json({ ok: true }));
    app.post("/api/clientes", (_req, res) =>
      res.status(201).json({ ok: true }),
    );

    await request(app)
      .post("/api/sync/ack?desde=prueba")
      .send({ hasta: "2026-01-01T00:00:00.000Z" })
      .expect(200, { ok: true });
    expect(dbMocks.insert).not.toHaveBeenCalled();

    await request(app)
      .post("/api/clientes")
      .send({ nombre: "Prueba" })
      .expect(201, { ok: true });
    expect(dbMocks.insert).toHaveBeenCalledTimes(1);
    expect(dbMocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        entidad: "api",
        endpoint: "/clientes",
        origen: "remoto",
      }),
    );
  });
});
