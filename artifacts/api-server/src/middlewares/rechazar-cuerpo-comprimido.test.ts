import "../lib/solo-base-de-pruebas";
import express, { type Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { rechazarCuerpoComprimido } from "./rechazar-cuerpo-comprimido";

const ERROR = { error: "Codificacion de contenido no soportada" };

function crearAppDePrueba(): Express {
  const app = express();
  app.use(rechazarCuerpoComprimido);
  app.use(express.json());
  app.post("/echo", (req, res) => res.json(req.body));
  return app;
}

describe("rechazarCuerpoComprimido", () => {
  const app = crearAppDePrueba();

  it.each(["br", "gzip", "deflate", "GZIP", " br ", "gzip, br"])(
    "rechaza Content-Encoding %j antes de leer el cuerpo",
    async (encoding) => {
      await request(app)
        .post("/echo")
        .set("Content-Encoding", encoding)
        .send({ ok: true })
        .expect(415, ERROR);
    },
  );

  it.each([undefined, "identity"])(
    "permite una petición JSON con Content-Encoding %j",
    async (encoding) => {
      const req = request(app).post("/echo");
      if (encoding !== undefined) req.set("Content-Encoding", encoding);
      await req.send({ ok: true }).expect(200, { ok: true });
    },
  );
});

describe("rechazo previo al candado de acceso en la aplicación", () => {
  let app: Express;

  beforeAll(async () => {
    vi.stubEnv("CLAVE_ACCESO_REMOTO", "");
    vi.stubEnv("SYNC_TOKEN", "");
    app = (await import("../app")).default;
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("responde 415 al enviar un crédito comprimido sin clave de acceso", async () => {
    await request(app)
      .post("/api/creditos")
      .set("Content-Type", "application/json")
      .set("Content-Encoding", "br")
      .send({ tipo: "credito" })
      .expect(415, ERROR);
  });
});
