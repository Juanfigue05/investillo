import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const deleteWhere = vi.fn().mockResolvedValue([]);
  const insertValues = vi.fn().mockResolvedValue([]);
  const selectLimit = vi.fn().mockResolvedValue([]);
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  return {
    poolQuery: vi.fn().mockResolvedValue({}),
    deleteWhere,
    insertValues,
    selectLimit,
    dbSelect: vi.fn(() => ({ from: selectFrom })),
    dbDelete: vi.fn(() => ({ where: deleteWhere })),
    dbInsert: vi.fn(() => ({ values: insertValues })),
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  gt: vi.fn(),
  lt: vi.fn(),
}));
vi.mock("@workspace/db", () => ({
  db: {
    select: dbMocks.dbSelect,
    delete: dbMocks.dbDelete,
    insert: dbMocks.dbInsert,
  },
  pool: { query: dbMocks.poolQuery },
}));
vi.mock("@workspace/db/schema", () => ({
  sesionesAccesoTable: { tokenHash: {}, expiraEn: {} },
}));
vi.mock("../lib/logger", () => ({ logger: { error: vi.fn() } }));

const TOKEN = "s".repeat(64);

async function crearApp() {
  const { bloqueoAccesoRemoto } = await import("./acceso-remoto");
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(bloqueoAccesoRemoto);
  app.get("/api/sync/pull", (_req, res) => res.json({ ok: true }));
  app.get("/api/datos", (_req, res) => res.json({ ok: true }));
  app.post("/api/datos", (_req, res) => res.json({ ok: true }));
  return app;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("bloqueoAccesoRemoto", () => {
  it("acepta el token de sincronización para pull y solicitudes API", async () => {
    vi.stubEnv("SYNC_TOKEN", TOKEN);
    vi.stubEnv("CLAVE_ACCESO_REMOTO", "");
    const app = await crearApp();

    await request(app)
      .get("/api/sync/pull")
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200, { ok: true });
    await request(app)
      .get("/api/datos")
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200, { ok: true });
    await request(app)
      .post("/api/datos")
      .set("Authorization", `Bearer ${TOKEN}`)
      .set("X-Sync-Apply", "true")
      .expect(200, { ok: true });
  });

  it("rechaza llamadas de sincronización sin credencial válida", async () => {
    vi.stubEnv("SYNC_TOKEN", TOKEN);
    vi.stubEnv("CLAVE_ACCESO_REMOTO", "");
    const app = await crearApp();

    await request(app)
      .get("/api/sync/pull")
      .expect(401, { error: "Autenticación de sincronización requerida" });
    await request(app)
      .post("/api/datos")
      .set("X-Sync-Apply", "true")
      .set("Authorization", `Bearer ${"x".repeat(64)}`)
      .expect(401, { error: "Autenticación de sincronización requerida" });
  });

  it("falla cerrado si la autenticación de sincronización no está configurada", async () => {
    vi.stubEnv("SYNC_TOKEN", "");
    vi.stubEnv("CLAVE_ACCESO_REMOTO", "");
    const app = await crearApp();

    await request(app).get("/api/sync/pull").expect(503, {
      error: "La autenticación de sincronización no está configurada",
    });
  });

  it("limita a cinco intentos fallidos de clave por ventana", async () => {
    vi.stubEnv("SYNC_TOKEN", "");
    vi.stubEnv("CLAVE_ACCESO_REMOTO", "clave-configurada");
    const app = await crearApp();

    for (let attempt = 0; attempt < 5; attempt++) {
      await request(app)
        .post("/acceso")
        .type("form")
        .send({ clave: "incorrecta" })
        .expect(401);
    }

    await request(app)
      .post("/acceso")
      .type("form")
      .send({ clave: "incorrecta" })
      .expect(429);
  });

  it("guarda solo el hash del token y revoca la sesión al cerrar sesión", async () => {
    vi.stubEnv("SYNC_TOKEN", "");
    vi.stubEnv("CLAVE_ACCESO_REMOTO", "clave-configurada");
    const app = await crearApp();
    const login = await request(app)
      .post("/acceso")
      .set("X-Forwarded-Proto", "https")
      .type("form")
      .send({ clave: "clave-configurada" })
      .expect(302);
    const setCookieHeader = login.headers["set-cookie"];
    const setCookie = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : [setCookieHeader];
    const sessionCookie = setCookie.find((cookie) =>
      cookie.startsWith("investillo_sesion="),
    );
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("Secure");
    expect(sessionCookie).toContain("SameSite=Lax");

    const token = sessionCookie!.split(";")[0].split("=")[1];
    expect(dbMocks.insertValues).toHaveBeenCalledWith({
      tokenHash: expect.any(String),
      expiraEn: expect.any(Date),
    });
    const savedSession = dbMocks.insertValues.mock.calls[0][0] as {
      tokenHash: string;
      expiraEn: Date;
    };
    expect(savedSession.tokenHash).toBe(
      await import("node:crypto").then(({ default: crypto }) =>
        crypto.createHash("sha256").update(token).digest("hex"),
      ),
    );
    expect(savedSession.tokenHash).not.toBe(token);

    await request(app)
      .get("/api/datos")
      .set("Cookie", `investillo_sesion=${token}`)
      .expect(200, { ok: true });
    const logout = await request(app)
      .post("/bloquear")
      .set("Cookie", `investillo_sesion=${token}`)
      .expect(303);
    expect(logout.headers["set-cookie"]).toEqual(
      expect.arrayContaining([expect.stringContaining("investillo_sesion=;")]),
    );
    expect(dbMocks.dbDelete).toHaveBeenCalledTimes(2);
    await request(app)
      .get("/api/datos")
      .set("Cookie", `investillo_sesion=${token}`)
      .expect(401);
    expect(dbMocks.dbSelect).toHaveBeenCalledTimes(1);
  });
});
