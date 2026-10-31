import assert from "node:assert/strict";
import test from "node:test";
import { mismoDestinoPostgres, validarDestinoBackup } from "./backup-destino";

test("reconoce como iguales URLs con credenciales distintas", () => {
  assert.equal(
    mismoDestinoPostgres(
      "postgres://origen:secreto@db.example:5432/investillo?sslmode=require",
      "postgresql://destino:otro@DB.EXAMPLE/investillo",
    ),
    true,
  );
});

test("no considera iguales bases distintas del mismo servidor", () => {
  assert.equal(
    mismoDestinoPostgres(
      "postgres://usuario:secreto@db.example/investillo",
      "postgres://usuario:secreto@db.example/investillo_copia",
    ),
    false,
  );
});

test("reconoce aliases loopback y el puerto PostgreSQL predeterminado", () => {
  assert.equal(
    mismoDestinoPostgres(
      "postgres://usuario:secreto@localhost/investillo",
      "postgres://otro:clave@127.0.0.1:5432/investillo",
    ),
    true,
  );
});

test("rechaza un destino que coincide con el origen sin exponer URLs", () => {
  const origen = "postgres://usuario:secreto@db.example/investillo";
  assert.throws(
    () => validarDestinoBackup(origen, "postgres://otro:clave@db.example/investillo"),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("coincide") &&
      !error.message.includes("secreto") &&
      !error.message.includes("clave") &&
      !error.message.includes("db.example"),
  );
});
