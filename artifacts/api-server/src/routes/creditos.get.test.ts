import "../lib/solo-base-de-pruebas";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";

const creditosCreados: number[] = [];
const clientesCreados: number[] = [];

afterEach(async () => {
  for (const id of creditosCreados.splice(0)) {
    await request(app).delete(`/api/creditos/${id}`);
  }
  for (const id of clientesCreados.splice(0)) {
    await request(app).delete(`/api/clientes/${id}`);
  }
});

describe("GET /api/creditos/:id", () => {
  it("ordena de forma estable créditos con la misma fecha", async () => {
    const fechaFactura = new Date().toISOString().slice(0, 10);
    const idsCreados: number[] = [];

    for (const concepto of ["TEST-ORDEN-A", "TEST-ORDEN-B"]) {
      const creado = await request(app)
        .post("/api/creditos")
        .send({
          tipo: "credito",
          concepto: `${concepto}-${Date.now()}-${crypto.randomUUID()}`,
          fechaFactura,
          nombreCliente: "Cliente Test Orden",
          valorCredito: 10,
          lineas: [
            {
              productoNombre: concepto,
              cantidad: 1,
              precioVenta: 10,
              precioCompra: 0,
            },
          ],
        });

      expect(creado.status).toBe(201);
      creditosCreados.push(creado.body.id as number);
      idsCreados.push(creado.body.id as number);
    }

    const respuesta = await request(app).get("/api/creditos?tipo=credito");
    const idsDevueltos = respuesta.body
      .filter((credito: { id: number }) => idsCreados.includes(credito.id))
      .map((credito: { id: number }) => credito.id);

    expect(respuesta.status).toBe(200);
    expect(idsDevueltos).toEqual(idsCreados);
  });

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

  it("vincula el crédito con un cliente registrado de nombre y teléfono coincidentes", async () => {
    const nombre = `Cliente con cuenta ${Date.now()}`;
    const telefono = `310${Date.now().toString().slice(-7)}`;
    const cliente = await request(app)
      .post("/api/clientes")
      .send({ nombre, telefono });

    expect(cliente.status).toBe(201);
    clientesCreados.push(cliente.body.id as number);

    const creado = await request(app)
      .post("/api/creditos")
      .send({
        tipo: "credito",
        concepto: `TEST-CLIENTE-CREDITO-${Date.now()}`,
        fechaFactura: new Date().toISOString().slice(0, 10),
        nombreCliente: nombre,
        telefonoCliente: telefono,
        valorCredito: 100,
        lineas: [
          {
            productoNombre: "Línea vinculada",
            cantidad: 1,
            precioVenta: 100,
            precioCompra: 0,
          },
        ],
      });

    expect(creado.status).toBe(201);
    creditosCreados.push(creado.body.id as number);
    expect(creado.body.clienteId).toBe(cliente.body.id);
  });

  it("no incluye metadatos de sincronización en la respuesta GET", async () => {
    const creado = await request(app)
      .post("/api/creditos")
      .send({
        tipo: "credito",
        concepto: `TEST-GET-CREDITO-SYNC-${Date.now()}`,
        fechaFactura: new Date().toISOString().slice(0, 10),
        nombreCliente: "Cliente Test GET",
        valorCredito: 100,
        lineas: [
          {
            productoNombre: "Línea GET Sync",
            cantidad: 1,
            precioVenta: 100,
            precioCompra: 0,
          },
        ],
      });

    expect(creado.status).toBe(201);
    creditosCreados.push(creado.body.id as number);

    const respuesta = await request(app).get(`/api/creditos/${creado.body.id}`);

    expect(respuesta.status).toBe(200);
    expect(
      Object.keys(respuesta.body).filter((campo) => campo.startsWith("_sync")),
    ).toEqual([]);
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
