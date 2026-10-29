import "../lib/solo-base-de-pruebas";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";

const creditosCreados: number[] = [];

afterEach(async () => {
  for (const id of creditosCreados.splice(0)) {
    await request(app).delete(`/api/creditos/${id}`);
  }
});

describe("GET /api/creditos/:id", () => {
  it("devuelve el crédito y sus líneas con los mismos IDs del POST", async () => {
    const creado = await request(app)
      .post("/api/creditos")
      .send({
        tipo: "credito",
        concepto: `TEST-GET-CREDITO-${Date.now()}`,
        fechaFactura: new Date().toISOString().slice(0, 10),
        nombreCliente: "Cliente Test GET",
        valorCredito: 120,
        lineas: [
          {
            productoNombre: "Línea GET A",
            cantidad: 1,
            precioVenta: 50,
            precioCompra: 0,
          },
          {
            productoNombre: "Línea GET B",
            cantidad: 1,
            precioVenta: 70,
            precioCompra: 0,
          },
        ],
      });

    expect(creado.status).toBe(201);
    creditosCreados.push(creado.body.id as number);

    const respuesta = await request(app).get(`/api/creditos/${creado.body.id}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual(creado.body);
    expect(respuesta.body.id).toBe(creado.body.id);
    expect(respuesta.body.lineas).toHaveLength(2);
    expect(respuesta.body.lineas.map((linea: { id: number }) => linea.id)).toEqual(
      creado.body.lineas.map((linea: { id: number }) => linea.id),
    );
  });

  it("responde 404 cuando el crédito no existe", async () => {
    const respuesta = await request(app).get("/api/creditos/2147483647");

    expect(respuesta.status).toBe(404);
  });

  it("responde 404 cuando el ID supera el rango de la base de datos", async () => {
    const respuesta = await request(app).get("/api/creditos/2147483648");

    expect(respuesta.status).toBe(404);
  });

  it("responde 400 cuando el ID no es numérico", async () => {
    const respuesta = await request(app).get("/api/creditos/no-es-id");

    expect(respuesta.status).toBe(400);
  });
});
