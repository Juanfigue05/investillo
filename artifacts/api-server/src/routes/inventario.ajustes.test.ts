import "../lib/solo-base-de-pruebas";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { db } from "@workspace/db";
import {
  eventosSincronizacionTable,
  movimientosInventarioTable,
  operacionesSincronizadasTable,
  productosTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import app from "../app";

const operationIds: string[] = [];
const productoIds: number[] = [];

async function crearProducto() {
  const [producto] = await db.insert(productosTable).values({
    nombre: "Producto Test Ajuste",
    codigo: `AJUSTE-${crypto.randomUUID()}`,
    precioCompra: "10",
    precioVentaSinIva: "20",
    precioVentaConIva: "23.8",
    stockActual: "10",
    stockLocal: "8",
    stockBodega: "2",
    stockMinimo: "0",
  }).returning();
  productoIds.push(producto.id);
  return producto;
}

afterEach(async () => {
  for (const operationId of operationIds.splice(0)) {
    await db.delete(movimientosInventarioTable)
      .where(eq(movimientosInventarioTable.operationId, operationId));
    await db.delete(eventosSincronizacionTable)
      .where(eq(eventosSincronizacionTable.operationId, operationId));
    await db.delete(operacionesSincronizadasTable)
      .where(eq(operacionesSincronizadasTable.operationId, operationId));
  }
  for (const id of productoIds.splice(0)) {
    await db.delete(movimientosInventarioTable)
      .where(eq(movimientosInventarioTable.productoId, id));
    await db.delete(productosTable).where(eq(productosTable.id, id));
  }
});

describe("ajustes físicos de inventario", () => {
  it("registra un conteo y conserva el saldo de cada ubicación", async () => {
    const producto = await crearProducto();
    const operationId = crypto.randomUUID();
    operationIds.push(operationId);

    const response = await request(app)
      .post(`/api/inventario/${producto.id}/ajustes`)
      .set("X-Operation-Id", operationId)
      .send({
        ubicacion: "local",
        direccion: "restar",
        cantidad: 3,
        motivo: "conteo",
      });

    expect(response.status).toBe(201);
    const [actualizado] = await db.select().from(productosTable)
      .where(eq(productosTable.id, producto.id));
    expect(actualizado.stockLocal).toBe("5.000");
    expect(actualizado.stockBodega).toBe("2.000");
    expect(actualizado.stockActual).toBe("7.000");

    const [movimiento] = await db.select().from(movimientosInventarioTable)
      .where(eq(movimientosInventarioTable.operationId, operationId));
    expect(movimiento).toMatchObject({
      productoId: producto.id,
      tipo: "ajuste",
      motivo: "conteo",
      direccion: "restar",
      stockActualAntes: "10.000",
      stockActualDespues: "7.000",
    });
  });

  it("rechaza un ajuste fijo con dirección incorrecta y un saldo negativo", async () => {
    const producto = await crearProducto();

    const direccionIncorrecta = await request(app)
      .post(`/api/inventario/${producto.id}/ajustes`)
      .send({
        ubicacion: "local",
        direccion: "sumar",
        cantidad: 1,
        motivo: "danado",
      });
    expect(direccionIncorrecta.status).toBe(400);

    const saldoNegativo = await request(app)
      .post(`/api/inventario/${producto.id}/ajustes`)
      .send({
        ubicacion: "bodega",
        direccion: "restar",
        cantidad: 3,
        motivo: "conteo",
      });
    expect(saldoNegativo.status).toBe(400);

    const [sinCambios] = await db.select().from(productosTable)
      .where(eq(productosTable.id, producto.id));
    expect(sinCambios.stockActual).toBe("10.000");
  });

  it("no repite un ajuste cuando se reintenta la misma operación", async () => {
    const producto = await crearProducto();
    const operationId = crypto.randomUUID();
    operationIds.push(operationId);
    const payload = {
      ubicacion: "local",
      direccion: "sumar",
      cantidad: 2,
      motivo: "conteo",
    };

    const primera = await request(app)
      .post(`/api/inventario/${producto.id}/ajustes`)
      .set("X-Operation-Id", operationId)
      .send(payload);
    const reintento = await request(app)
      .post(`/api/inventario/${producto.id}/ajustes`)
      .set("X-Operation-Id", operationId)
      .send(payload);

    expect(primera.status).toBe(201);
    expect(reintento.status).toBe(201);
    expect(reintento.body).toEqual(primera.body);
    const [actualizado] = await db.select().from(productosTable)
      .where(eq(productosTable.id, producto.id));
    expect(actualizado.stockActual).toBe("12.000");
    const movimientos = await db.select().from(movimientosInventarioTable)
      .where(eq(movimientosInventarioTable.operationId, operationId));
    expect(movimientos).toHaveLength(1);
  });
});
