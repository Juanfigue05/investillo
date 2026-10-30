import "../lib/solo-base-de-pruebas";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { db, pool } from "@workspace/db";
import {
  comprasTable,
  eventosSincronizacionTable,
  historialPreciosTable,
  operacionesSincronizadasTable,
  productosTable,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

const syncToken = "orden-11-test-sync-token-more-than-32-bytes";
vi.stubEnv("SYNC_TOKEN", syncToken);
const { default: app } = await import("../app");

const operationIds = new Set<string>();
const compraIds = new Set<number>();
const productoIds = new Set<number>();

afterEach(async () => {
  const operations = [...operationIds];
  const compras = [...compraIds];
  const productos = [...productoIds];
  operationIds.clear();
  compraIds.clear();
  productoIds.clear();

  if (operations.length > 0) {
    await db.delete(eventosSincronizacionTable).where(
      inArray(eventosSincronizacionTable.operationId, operations),
    );
    await db.delete(operacionesSincronizadasTable).where(
      inArray(operacionesSincronizadasTable.operationId, operations),
    );
  }
  if (compras.length > 0) {
    await db.delete(historialPreciosTable).where(
      inArray(historialPreciosTable.compraId, compras),
    );
    await db.delete(comprasTable).where(inArray(comprasTable.id, compras));
  }
  if (productos.length > 0) {
    await db.delete(productosTable).where(
      inArray(productosTable.id, productos),
    );
  }
});

function operationId(): string {
  const id = randomUUID();
  operationIds.add(id);
  return id;
}

async function crearProducto() {
  const [producto] = await db.insert(productosTable).values({
    nombre: `Producto llegada ${randomUUID()}`,
    codigo: `LLEGADA-${randomUUID()}`,
    precioCompra: "100",
    precioVentaSinIva: "200",
    precioVentaConIva: "238",
    stockActual: "10",
    stockLocal: "6",
    stockBodega: "4",
    stockMinimo: "0",
  }).returning({ id: productosTable.id });
  productoIds.add(producto.id);
  return producto.id;
}

async function crearCompra(
  productoId: number,
  estado: "pendiente" | "llegado" = "pendiente",
) {
  const [compra] = await db.insert(comprasTable).values({
    productoId,
    productoNombre: `Producto ${productoId}`,
    productoCodigo: `COD-${productoId}`,
    stockActual: "10",
    stockMinimo: "0",
    estado,
    ...(estado === "llegado" ? { cantidadRecibida: "2" } : {}),
  }).returning({ id: comprasTable.id });
  compraIds.add(compra.id);
  return compra.id;
}

function llegada(cantidadRecibida = 3) {
  return {
    estado: "llegado",
    cantidadRecibida,
    cantidadLocal: cantidadRecibida,
    cantidadBodega: 0,
    nuevoPrecioCompra: 120,
    nuevoPrecioVentaSinIva: 250,
    tieneIva: true,
  };
}

async function stock(productoId: number) {
  const [producto] = await db
    .select({
      stockActual: productosTable.stockActual,
      stockLocal: productosTable.stockLocal,
      stockBodega: productosTable.stockBodega,
    })
    .from(productosTable)
    .where(eq(productosTable.id, productoId));
  return producto;
}

async function compra(id: number) {
  const [registro] = await db
    .select()
    .from(comprasTable)
    .where(eq(comprasTable.id, id));
  return registro;
}

async function historial(id: number) {
  return db
    .select()
    .from(historialPreciosTable)
    .where(eq(historialPreciosTable.compraId, id));
}

async function evento(operation: string) {
  const [registro] = await db
    .select()
    .from(eventosSincronizacionTable)
    .where(eq(eventosSincronizacionTable.operationId, operation));
  return registro;
}

describe("llegada de compras", () => {
  it("aplica una llegada una vez y registra su historial y referencia", async () => {
    const operation = operationId();
    const productoId = await crearProducto();
    const compraId = await crearCompra(productoId);

    const response = await request(app)
      .put(`/api/compras/${compraId}`)
      .set("X-Operation-Id", operation)
      .send(llegada());

    expect(response.status).toBe(200);
    expect((await stock(productoId))?.stockActual).toBe("13.000");
    expect((await stock(productoId))?.stockLocal).toBe("9.000");
    expect((await historial(compraId))).toHaveLength(1);
    expect((await compra(compraId))?.estado).toBe("llegado");
    expect(await evento(operation)).toMatchObject({
      operationId: operation,
      referenciasRespuesta: [{
        campo: "_syncHistorialPrecioId",
        entidad: "historial_precios",
        valorLocal: String(response.body._syncHistorialPrecioId),
      }],
    });
  });

  it("rechaza otra llegada con distinto operation id sin tocar inventario", async () => {
    const firstOperation = operationId();
    const secondOperation = operationId();
    const productoId = await crearProducto();
    const compraId = await crearCompra(productoId);

    const first = await request(app)
      .put(`/api/compras/${compraId}`)
      .set("X-Operation-Id", firstOperation)
      .send(llegada());
    const stockAfterFirst = await stock(productoId);

    const second = await request(app)
      .put(`/api/compras/${compraId}`)
      .set("X-Operation-Id", secondOperation)
      .set("X-Sync-Token", syncToken)
      .set("X-Sync-Apply", "true")
      .send(llegada());

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/correcci[oó]n de compra/i);
    expect(await stock(productoId)).toEqual(stockAfterFirst);
    expect(await historial(compraId)).toHaveLength(1);
    expect(await evento(secondOperation)).toBeUndefined();
  });

  it("responde yaProcesado al repetir el mismo operation id", async () => {
    const operation = operationId();
    const productoId = await crearProducto();
    const compraId = await crearCompra(productoId);

    const first = await request(app)
      .put(`/api/compras/${compraId}`)
      .set("X-Operation-Id", operation)
      .send(llegada());
    const stockAfterFirst = await stock(productoId);
    const second = await request(app)
      .put(`/api/compras/${compraId}`)
      .set("X-Operation-Id", operation)
      .send(llegada());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.yaProcesado).toBe(true);
    expect(await stock(productoId)).toEqual(stockAfterFirst);
    expect(await historial(compraId)).toHaveLength(1);
  });

  it("rechaza cantidad cero y producto ausente sin marcar la compra como llegada", async () => {
    const operationCantidad = operationId();
    const productoId = await crearProducto();
    const compraCantidad = await crearCompra(productoId);
    const cantidadInvalida = await request(app)
      .put(`/api/compras/${compraCantidad}`)
      .set("X-Operation-Id", operationCantidad)
      .send(llegada(0));
    expect(cantidadInvalida.status).toBe(400);
    expect(cantidadInvalida.body.error).toMatch(/mayor que cero/i);
    expect((await compra(compraCantidad))?.estado).toBe("pendiente");
    expect(await historial(compraCantidad)).toHaveLength(0);

    const operationProducto = operationId();
    const compraSinProducto = await crearCompra(2_000_000_000);
    const productoInexistente = await request(app)
      .put(`/api/compras/${compraSinProducto}`)
      .set("X-Operation-Id", operationProducto)
      .send(llegada());
    expect(productoInexistente.status).toBe(404);
    expect(productoInexistente.body.error).toMatch(/producto.*no encontrado/i);
    expect((await compra(compraSinProducto))?.estado).toBe("pendiente");
    expect(await historial(compraSinProducto)).toHaveLength(0);
    expect(await evento(operationCantidad)).toBeUndefined();
    expect(await evento(operationProducto)).toBeUndefined();
  });

  it("revierte stock, historial, compra y evento si falla una escritura intermedia", async () => {
    const operation = operationId();
    const productoId = await crearProducto();
    const compraId = await crearCompra(productoId);
    const stockBefore = await stock(productoId);

    await pool.query(
      `CREATE OR REPLACE FUNCTION test_fail_compra_historial()
       RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NEW.compra_id = ${compraId} THEN
           RAISE EXCEPTION 'fallo de prueba en historial de compra';
         END IF;
         RETURN NEW;
       END $$;
       CREATE TRIGGER test_fail_compra_historial
       BEFORE INSERT ON historial_precios
       FOR EACH ROW EXECUTE FUNCTION test_fail_compra_historial()`,
    );
    try {
      const response = await request(app)
        .put(`/api/compras/${compraId}`)
        .set("X-Operation-Id", operation)
        .send(llegada());
      expect(response.status).toBe(500);
      expect(await stock(productoId)).toEqual(stockBefore);
      expect((await compra(compraId))?.estado).toBe("pendiente");
      expect(await historial(compraId)).toHaveLength(0);
      expect(await evento(operation)).toBeUndefined();
      expect(
        await db
          .select()
          .from(operacionesSincronizadasTable)
          .where(eq(operacionesSincronizadasTable.operationId, operation)),
      ).toHaveLength(0);
    } finally {
      await pool.query(
        `DROP TRIGGER IF EXISTS test_fail_compra_historial ON historial_precios;
         DROP FUNCTION IF EXISTS test_fail_compra_historial()`,
      );
    }
  });

  it("no aplica ninguna compra del lote si una compra intermedia no existe", async () => {
    const operation = operationId();
    const productoIdsLote = [
      await crearProducto(),
      await crearProducto(),
      await crearProducto(),
    ];
    const compraIdsLote = await Promise.all(
      productoIdsLote.map((productoId) => crearCompra(productoId)),
    );
    const stockBefore = await Promise.all(productoIdsLote.map(stock));

    const response = await request(app)
      .post("/api/compras/lote-llegada")
      .set("X-Operation-Id", operation)
      .send({
        proveedor: "Proveedor prueba",
        items: [
          {
            id: compraIdsLote[0],
            cantidadRecibida: 2,
            cantidadLocal: 2,
            cantidadBodega: 0,
            nuevoPrecioCompra: 100,
            nuevoPrecioVentaSinIva: 200,
            tieneIva: true,
            actualizarPrecioInventario: true,
          },
          {
            id: 2_000_000_000,
            cantidadRecibida: 2,
            cantidadLocal: 2,
            cantidadBodega: 0,
            nuevoPrecioCompra: 100,
            nuevoPrecioVentaSinIva: 200,
            tieneIva: true,
            actualizarPrecioInventario: true,
          },
          {
            id: compraIdsLote[2],
            cantidadRecibida: 2,
            cantidadLocal: 2,
            cantidadBodega: 0,
            nuevoPrecioCompra: 100,
            nuevoPrecioVentaSinIva: 200,
            tieneIva: true,
            actualizarPrecioInventario: true,
          },
        ],
      });

    expect(response.status).toBe(404);
    expect(await Promise.all(productoIdsLote.map(stock))).toEqual(stockBefore);
    expect(
      await Promise.all(compraIdsLote.map(async (id) => (await compra(id))?.estado)),
    ).toEqual(["pendiente", "pendiente", "pendiente"]);
    expect(
      (await Promise.all(compraIdsLote.map(historial))).flat(),
    ).toHaveLength(0);
    expect(await evento(operation)).toBeUndefined();
  });

  it("aplica un lote válido y conserva las referencias en el orden de entrada", async () => {
    const operation = operationId();
    const productoIdsLote = [await crearProducto(), await crearProducto()];
    const compraIdsLote = await Promise.all(
      productoIdsLote.map((productoId) => crearCompra(productoId)),
    );

    const response = await request(app)
      .post("/api/compras/lote-llegada")
      .set("X-Operation-Id", operation)
      .send({
        proveedor: "Proveedor prueba",
        items: compraIdsLote.map((id) => ({
          id,
          cantidadRecibida: 2,
          cantidadLocal: 1,
          cantidadBodega: 1,
          nuevoPrecioCompra: 100,
          nuevoPrecioVentaSinIva: 200,
          tieneIva: true,
          actualizarPrecioInventario: true,
        })),
      });

    expect(response.status).toBe(200);
    expect(response.body.resultados).toHaveLength(2);
    expect(await Promise.all(compraIdsLote.map(async (id) => (await compra(id))?.estado)))
      .toEqual(["llegado", "llegado"]);
    const idsHistorial = await Promise.all(
      compraIdsLote.map(async (id) => (await historial(id))[0]?.id),
    );
    expect(idsHistorial.every((id) => Number.isInteger(id))).toBe(true);
    expect((await evento(operation))?.referenciasRespuesta).toEqual(
      idsHistorial.map((id, index) => ({
        campo: `resultados.${index}._syncHistorialPrecioId`,
        entidad: "historial_precios",
        valorLocal: String(id),
      })),
    );
  });

  it("no crea historial al corregir una llegada y guarda la corrección atómicamente", async () => {
    const operation = operationId();
    const productoId = await crearProducto();
    const compraId = await crearCompra(productoId, "llegado");
    const response = await request(app)
      .patch(`/api/compras/${compraId}/corregir`)
      .set("X-Operation-Id", operation)
      .send({ cantidadRecibida: 4, precioCompraRegistrado: 125 });

    expect(response.status).toBe(200);
    expect((await stock(productoId))?.stockActual).toBe("12.000");
    expect((await compra(compraId))?.cantidadRecibida).toBe("4.000");
    expect(await historial(compraId)).toHaveLength(0);
    expect(await evento(operation)).toMatchObject({
      tipo: "corregir",
      entidad: "compra",
    });
  });
});
