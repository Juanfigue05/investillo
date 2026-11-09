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

describe("GET /api/creditos", () => {
  it("devuelve varios créditos con sus líneas asociadas", async () => {
    const conceptos = [
      `TEST-LISTA-CREDITO-A-${Date.now()}`,
      `TEST-LISTA-CREDITO-B-${Date.now()}`,
    ];
    const creados = await Promise.all(
      conceptos.map((concepto, index) =>
        request(app)
          .post("/api/creditos")
          .send({
            tipo: "credito",
            concepto,
            fechaFactura: new Date().toISOString().slice(0, 10),
            nombreCliente: `Cliente Test Lista ${index}`,
            valorCredito: 100,
            lineas: [
              {
                productoNombre: `Línea Test Lista ${index}`,
                cantidad: 1,
                precioVenta: 100,
                precioCompra: 0,
              },
            ],
          }),
      ),
    );

    for (const creado of creados) {
      expect(creado.status).toBe(201);
      creditosCreados.push(creado.body.id as number);
    }

    const respuesta = await request(app).get("/api/creditos?tipo=credito");

    expect(respuesta.status).toBe(200);
    const encontrados = respuesta.body.filter(
      (credito: { concepto: string | null }) =>
        credito.concepto !== null && conceptos.includes(credito.concepto),
    );
    expect(encontrados).toHaveLength(2);
    const lineasPorConcepto = Object.fromEntries(
      encontrados.map(
        (credito: {
          concepto: string;
          lineas: { productoNombre: string }[];
        }) => [
          credito.concepto,
          credito.lineas.map((linea) => linea.productoNombre),
        ],
      ),
    );
    expect(lineasPorConcepto).toEqual(
      Object.fromEntries(
        conceptos.map((concepto, index) => [
          concepto,
          [`Línea Test Lista ${index}`],
        ]),
      ),
    );
  });
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

  it("rechaza un abono inicial mayor que el crédito o una de sus líneas", async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const abonoMayorAlCredito = await request(app)
      .post("/api/creditos")
      .send({
        tipo: "credito",
        concepto: `TEST-ABONO-MAYOR-CREDITO-${Date.now()}`,
        fechaFactura: hoy,
        nombreCliente: "Cliente Test Abono Inicial",
        valorCredito: 100,
        valorAbonado: 100.01,
        abonoInicialFecha: hoy,
        lineas: [
          {
            productoNombre: "Línea de cien",
            cantidad: 1,
            precioVenta: 100,
            precioCompra: 0,
            valorAbonado: 100.01,
          },
        ],
      });

    expect(abonoMayorAlCredito.status).toBe(400);
    expect(abonoMayorAlCredito.body.error).toMatch(/no puede superar el valor del crédito/i);

    const abonoMayorALinea = await request(app)
      .post("/api/creditos")
      .send({
        tipo: "credito",
        concepto: `TEST-ABONO-MAYOR-LINEA-${Date.now()}`,
        fechaFactura: hoy,
        nombreCliente: "Cliente Test Abono Línea",
        valorCredito: 100,
        valorAbonado: 60,
        abonoInicialFecha: hoy,
        lineas: [
          {
            productoNombre: "Primera línea",
            cantidad: 1,
            precioVenta: 50,
            precioCompra: 0,
            valorAbonado: 51,
          },
          {
            productoNombre: "Segunda línea",
            cantidad: 1,
            precioVenta: 50,
            precioCompra: 0,
            valorAbonado: 9,
          },
        ],
      });

    expect(abonoMayorALinea.status).toBe(400);
    expect(abonoMayorALinea.body.error).toMatch(/no puede superar el valor de esa línea/i);
  });

  it("rechaza pagos que exceden el saldo y no permite modificar el acumulado por PUT", async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const creado = await request(app)
      .post("/api/creditos")
      .send({
        tipo: "nosdebe",
        fechaFactura: hoy,
        nombreCliente: "Cliente Test Tope de Abono",
        valorCredito: 100,
        valorAbonado: 90,
        abonoInicialFecha: hoy,
        lineas: [
          {
            productoNombre: "Servicio de cien",
            cantidad: 1,
            precioVenta: 100,
            precioCompra: 0,
            valorAbonado: 90,
          },
        ],
      });

    expect(creado.status).toBe(201);
    creditosCreados.push(creado.body.id as number);
    const linea = creado.body.lineas[0] as {
      id: number;
      productoNombre: string;
      cantidad: number;
      precioVenta: number;
      precioCompra: number;
      valorAbonado: number;
    };

    const pagoExcedido = await request(app)
      .post(`/api/creditos/${creado.body.id}/abono`)
      .send({ valor: 10.01, lineas: [{ lineaId: linea.id, valor: 10.01 }] });
    expect(pagoExcedido.status).toBe(400);

    const acumuladoExcedido = await request(app)
      .put(`/api/creditos/${creado.body.id}`)
      .send({ valorAbonado: 100.01 });
    expect(acumuladoExcedido.status).toBe(400);
    expect(acumuladoExcedido.body.error).toMatch(/no pueden superar el valor del crédito/i);

    const totalReducido = await request(app)
      .put(`/api/creditos/${creado.body.id}`)
      .send({
        valorCredito: 80,
        lineas: [{ ...linea, precioVenta: 80, valorAbonado: 90 }],
      });
    expect(totalReducido.status).toBe(400);
  });

  it("serializa pagos concurrentes para no abonar por encima del total", async () => {
    const creado = await request(app)
      .post("/api/creditos")
      .send({
        tipo: "nosdebe",
        fechaFactura: new Date().toISOString().slice(0, 10),
        nombreCliente: "Cliente Test Pagos Simultáneos",
        valorCredito: 100,
        lineas: [
          {
            productoNombre: "Servicio con pagos simultáneos",
            cantidad: 1,
            precioVenta: 100,
            precioCompra: 0,
          },
        ],
      });

    expect(creado.status).toBe(201);
    creditosCreados.push(creado.body.id as number);
    const lineaId = creado.body.lineas[0].id as number;
    const registrarPago = () =>
      request(app)
        .post(`/api/creditos/${creado.body.id}/abono`)
        .send({ valor: 60, lineas: [{ lineaId, valor: 60 }] });

    const respuestas = await Promise.all([registrarPago(), registrarPago()]);
    expect(respuestas.filter((respuesta) => respuesta.status === 200)).toHaveLength(1);
    expect(respuestas.filter((respuesta) => respuesta.status !== 200)).toHaveLength(1);

    const persistido = await request(app).get(`/api/creditos/${creado.body.id}`);
    expect(persistido.body.valorAbonado).toBe(60);
  });
});
