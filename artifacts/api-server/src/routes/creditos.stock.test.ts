/**
 * Tests de integracion: Stock de productos en creditos
 *
 * Verifica que:
 * 1. Crear credito con productos → stock baja exactamente la cantidad indicada
 * 2. Pagar el credito completamente → stock NO baja de nuevo
 * 3. Abonar parcialmente → stock no cambia
 * 4. Eliminar el credito → stock se restaura
 * 5. Editar cantidad de una linea → solo se ajusta el delta
 * Extra: eliminar una fila de venta generada por un abono NO toca stock
 *
 * Aislamiento: cada test crea su propio producto con codigo unico, limpia el credito
 * primero (para que su FK no bloquee) y despues el producto. El afterEach actua como
 * red de seguridad para tests que fallen antes del cleanup normal.
 */

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "@workspace/db";
import {
  productosTable,
  ventasDiariasTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function crearProductoTest(stockInicial: number): Promise<number> {
  const codigo = `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const [p] = await db
    .insert(productosTable)
    .values({
      nombre: "Producto Test Stock",
      codigo,
      precioCompra: "10.00",
      precioVentaSinIva: "20.00",
      precioVentaConIva: "23.80",
      stockActual: String(stockInicial),
      stockMinimo: "0",
    })
    .returning();
  return p.id;
}

async function leerStock(productoId: number): Promise<number> {
  const [p] = await db
    .select({ stock: productosTable.stockActual })
    .from(productosTable)
    .where(eq(productosTable.id, productoId));
  return parseFloat(p?.stock ?? "0");
}

/** Elimina el credito via API (restaura stock) y luego borra el producto de prueba. */
async function cleanupTest(creditoId: number | null, productoId: number) {
  if (creditoId !== null) {
    await request(app).delete(`/api/creditos/${creditoId}`);
  }
  await db.delete(productosTable).where(eq(productosTable.id, productoId));
}

// Red de seguridad: si un test falla antes de su propio cleanup, lo hacemos aqui.
// Guardamos pares { creditoId, productoId } para garantizar el orden correcto.
const pendingCleanups: Array<{ creditoId: number | null; productoId: number }> = [];

afterEach(async () => {
  const items = pendingCleanups.splice(0);
  for (const { creditoId, productoId } of items) {
    try {
      await cleanupTest(creditoId, productoId);
    } catch {
      // ignorar — el producto o credito ya no existe
    }
  }
});

// ── Escenario 1: Crear credito con productos → stock baja exactamente ─────────

describe("Escenario 1: Crear credito con productos", () => {
  it("descuenta el stock exactamente la cantidad indicada al crear el credito", async () => {
    const STOCK_INICIAL = 50;
    const CANTIDAD = 3;

    const productoId = await crearProductoTest(STOCK_INICIAL);
    let creditoId: number | null = null;
    pendingCleanups.push({ creditoId, productoId });

    const stockAntes = await leerStock(productoId);
    expect(stockAntes).toBe(STOCK_INICIAL);

    const res = await request(app)
      .post("/api/creditos")
      .send({
        tipo: "credito",
        concepto: "TEST-001",
        fechaFactura: new Date().toISOString().split("T")[0],
        nombreCliente: "Cliente Test",
        valorCredito: 20 * CANTIDAD,
        lineas: [
          {
            productoId,
            productoNombre: "Producto Test Stock",
            cantidad: CANTIDAD,
            precioVenta: 20,
            precioCompra: 10,
          },
        ],
      });

    expect(res.status).toBe(201);
    creditoId = res.body.id as number;
    // Actualizar cleanup con el creditoId real
    pendingCleanups[pendingCleanups.length - 1]!.creditoId = creditoId;

    const stockDespues = await leerStock(productoId);
    expect(stockDespues).toBe(STOCK_INICIAL - CANTIDAD);

    // Cleanup: credito primero, luego producto
    await cleanupTest(creditoId, productoId);
    pendingCleanups.pop();
  });
});

// ── Escenario 2: Pagar el credito completamente → stock NO baja de nuevo ──────

describe("Escenario 2: Pagar credito completamente", () => {
  it("el stock no baja al registrar el pago completo", async () => {
    const STOCK_INICIAL = 100;
    const CANTIDAD = 5;
    const PRECIO = 20;

    const productoId = await crearProductoTest(STOCK_INICIAL);
    let creditoId: number | null = null;
    pendingCleanups.push({ creditoId, productoId });

    const resCr = await request(app)
      .post("/api/creditos")
      .send({
        tipo: "credito",
        concepto: "TEST-002",
        fechaFactura: new Date().toISOString().split("T")[0],
        nombreCliente: "Cliente Test",
        valorCredito: PRECIO * CANTIDAD,
        lineas: [
          {
            productoId,
            productoNombre: "Producto Test Stock",
            cantidad: CANTIDAD,
            precioVenta: PRECIO,
            precioCompra: 10,
          },
        ],
      });

    expect(resCr.status).toBe(201);
    creditoId = resCr.body.id as number;
    pendingCleanups[pendingCleanups.length - 1]!.creditoId = creditoId;
    const lineaId: number = resCr.body.lineas[0].id;

    const stockTrasCrear = await leerStock(productoId);
    expect(stockTrasCrear).toBe(STOCK_INICIAL - CANTIDAD);

    const resPago = await request(app)
      .post(`/api/creditos/${creditoId}/abono`)
      .send({
        valor: PRECIO * CANTIDAD,
        lineas: [{ lineaId, valor: PRECIO * CANTIDAD }],
      });

    expect(resPago.status).toBe(200);

    const stockTrasPago = await leerStock(productoId);
    // El pago no debe modificar el stock — ya se descontó al crear el crédito
    expect(stockTrasPago).toBe(STOCK_INICIAL - CANTIDAD);

    await cleanupTest(creditoId, productoId);
    pendingCleanups.pop();
  });
});

// ── Escenario 3: Abonar parcialmente → stock no cambia ─────────────────────────

describe("Escenario 3: Abono parcial", () => {
  it("el stock no cambia al registrar un pago parcial", async () => {
    const STOCK_INICIAL = 40;
    const CANTIDAD = 4;
    const PRECIO = 25;

    const productoId = await crearProductoTest(STOCK_INICIAL);
    let creditoId: number | null = null;
    pendingCleanups.push({ creditoId, productoId });

    const resCr = await request(app)
      .post("/api/creditos")
      .send({
        tipo: "credito",
        concepto: "TEST-003",
        fechaFactura: new Date().toISOString().split("T")[0],
        nombreCliente: "Cliente Test",
        valorCredito: PRECIO * CANTIDAD,
        lineas: [
          {
            productoId,
            productoNombre: "Producto Test Stock",
            cantidad: CANTIDAD,
            precioVenta: PRECIO,
            precioCompra: 10,
          },
        ],
      });

    expect(resCr.status).toBe(201);
    creditoId = resCr.body.id as number;
    pendingCleanups[pendingCleanups.length - 1]!.creditoId = creditoId;
    const lineaId: number = resCr.body.lineas[0].id;

    const stockTrasCrear = await leerStock(productoId);
    expect(stockTrasCrear).toBe(STOCK_INICIAL - CANTIDAD);

    const ABONO_PARCIAL = (PRECIO * CANTIDAD) / 2;
    const resAbono = await request(app)
      .post(`/api/creditos/${creditoId}/abono`)
      .send({
        valor: ABONO_PARCIAL,
        lineas: [{ lineaId, valor: ABONO_PARCIAL }],
      });

    expect(resAbono.status).toBe(200);

    const stockTrasAbono = await leerStock(productoId);
    // Stock igual que tras crear el crédito — el abono no toca inventario
    expect(stockTrasAbono).toBe(STOCK_INICIAL - CANTIDAD);

    await cleanupTest(creditoId, productoId);
    pendingCleanups.pop();
  });
});

// ── Escenario 4: Eliminar el crédito → stock se restaura ────────────────────────

describe("Escenario 4: Eliminar credito", () => {
  it("restaura el stock al eliminar el credito sin pagos", async () => {
    const STOCK_INICIAL = 20;
    const CANTIDAD = 7;

    const productoId = await crearProductoTest(STOCK_INICIAL);
    let creditoId: number | null = null;
    pendingCleanups.push({ creditoId, productoId });

    const resCr = await request(app)
      .post("/api/creditos")
      .send({
        tipo: "credito",
        concepto: "TEST-004",
        fechaFactura: new Date().toISOString().split("T")[0],
        nombreCliente: "Cliente Test",
        valorCredito: 20 * CANTIDAD,
        lineas: [
          {
            productoId,
            productoNombre: "Producto Test Stock",
            cantidad: CANTIDAD,
            precioVenta: 20,
            precioCompra: 10,
          },
        ],
      });

    expect(resCr.status).toBe(201);
    creditoId = resCr.body.id as number;
    pendingCleanups[pendingCleanups.length - 1]!.creditoId = creditoId;

    expect(await leerStock(productoId)).toBe(STOCK_INICIAL - CANTIDAD);

    const resDel = await request(app).delete(`/api/creditos/${creditoId}`);
    expect(resDel.status).toBe(200);
    creditoId = null; // ya eliminado

    expect(await leerStock(productoId)).toBe(STOCK_INICIAL);

    await cleanupTest(null, productoId);
    pendingCleanups.pop();
  });

  it("restaura el stock al eliminar un credito con abonos parciales previos", async () => {
    const STOCK_INICIAL = 30;
    const CANTIDAD = 6;
    const PRECIO = 50;

    const productoId = await crearProductoTest(STOCK_INICIAL);
    let creditoId: number | null = null;
    pendingCleanups.push({ creditoId, productoId });

    const resCr = await request(app)
      .post("/api/creditos")
      .send({
        tipo: "credito",
        concepto: "TEST-004B",
        fechaFactura: new Date().toISOString().split("T")[0],
        nombreCliente: "Cliente Test",
        valorCredito: PRECIO * CANTIDAD,
        lineas: [
          {
            productoId,
            productoNombre: "Producto Test Stock",
            cantidad: CANTIDAD,
            precioVenta: PRECIO,
            precioCompra: 10,
          },
        ],
      });

    expect(resCr.status).toBe(201);
    creditoId = resCr.body.id as number;
    pendingCleanups[pendingCleanups.length - 1]!.creditoId = creditoId;
    const lineaId: number = resCr.body.lineas[0].id;

    // Abono parcial
    await request(app)
      .post(`/api/creditos/${creditoId}/abono`)
      .send({ valor: PRECIO, lineas: [{ lineaId, valor: PRECIO }] });

    expect(await leerStock(productoId)).toBe(STOCK_INICIAL - CANTIDAD);

    const resDel = await request(app).delete(`/api/creditos/${creditoId}`);
    expect(resDel.status).toBe(200);
    creditoId = null;

    // Debe regresar al inicial — la eliminación restaura las líneas, no los abonos
    expect(await leerStock(productoId)).toBe(STOCK_INICIAL);

    await cleanupTest(null, productoId);
    pendingCleanups.pop();
  });
});

// ── Escenario 5: Editar cantidad de línea → solo se ajusta el delta ───────────

describe("Escenario 5: Editar cantidad de linea", () => {
  it("aumentar la cantidad descuenta solo la diferencia adicional", async () => {
    const STOCK_INICIAL = 60;
    const CANTIDAD_INICIAL = 4;
    const CANTIDAD_NUEVA = 7;
    const PRECIO = 20;

    const productoId = await crearProductoTest(STOCK_INICIAL);
    let creditoId: number | null = null;
    pendingCleanups.push({ creditoId, productoId });

    const resCr = await request(app)
      .post("/api/creditos")
      .send({
        tipo: "credito",
        concepto: "TEST-005A",
        fechaFactura: new Date().toISOString().split("T")[0],
        nombreCliente: "Cliente Test",
        valorCredito: PRECIO * CANTIDAD_INICIAL,
        lineas: [
          {
            productoId,
            productoNombre: "Producto Test Stock",
            cantidad: CANTIDAD_INICIAL,
            precioVenta: PRECIO,
            precioCompra: 10,
          },
        ],
      });

    expect(resCr.status).toBe(201);
    creditoId = resCr.body.id as number;
    pendingCleanups[pendingCleanups.length - 1]!.creditoId = creditoId;
    const lineaId: number = resCr.body.lineas[0].id;

    expect(await leerStock(productoId)).toBe(STOCK_INICIAL - CANTIDAD_INICIAL);

    const resPut = await request(app)
      .put(`/api/creditos/${creditoId}`)
      .send({
        valorCredito: PRECIO * CANTIDAD_NUEVA,
        lineas: [
          {
            id: lineaId,
            productoId,
            productoNombre: "Producto Test Stock",
            cantidad: CANTIDAD_NUEVA,
            precioVenta: PRECIO,
            precioCompra: 10,
          },
        ],
      });

    expect(resPut.status).toBe(200);

    // Solo debe haberse descontado el delta adicional
    expect(await leerStock(productoId)).toBe(STOCK_INICIAL - CANTIDAD_NUEVA);

    await cleanupTest(creditoId, productoId);
    pendingCleanups.pop();
  });

  it("reducir la cantidad restaura la diferencia en stock", async () => {
    const STOCK_INICIAL = 50;
    const CANTIDAD_INICIAL = 8;
    const CANTIDAD_NUEVA = 3;
    const PRECIO = 20;

    const productoId = await crearProductoTest(STOCK_INICIAL);
    let creditoId: number | null = null;
    pendingCleanups.push({ creditoId, productoId });

    const resCr = await request(app)
      .post("/api/creditos")
      .send({
        tipo: "credito",
        concepto: "TEST-005B",
        fechaFactura: new Date().toISOString().split("T")[0],
        nombreCliente: "Cliente Test",
        valorCredito: PRECIO * CANTIDAD_INICIAL,
        lineas: [
          {
            productoId,
            productoNombre: "Producto Test Stock",
            cantidad: CANTIDAD_INICIAL,
            precioVenta: PRECIO,
            precioCompra: 10,
          },
        ],
      });

    expect(resCr.status).toBe(201);
    creditoId = resCr.body.id as number;
    pendingCleanups[pendingCleanups.length - 1]!.creditoId = creditoId;
    const lineaId: number = resCr.body.lineas[0].id;

    expect(await leerStock(productoId)).toBe(STOCK_INICIAL - CANTIDAD_INICIAL);

    const resPut = await request(app)
      .put(`/api/creditos/${creditoId}`)
      .send({
        valorCredito: PRECIO * CANTIDAD_NUEVA,
        lineas: [
          {
            id: lineaId,
            productoId,
            productoNombre: "Producto Test Stock",
            cantidad: CANTIDAD_NUEVA,
            precioVenta: PRECIO,
            precioCompra: 10,
          },
        ],
      });

    expect(resPut.status).toBe(200);

    // El delta negativo debe devolver stock
    expect(await leerStock(productoId)).toBe(STOCK_INICIAL - CANTIDAD_NUEVA);

    await cleanupTest(creditoId, productoId);
    pendingCleanups.pop();
  });

  it("eliminar todas las lineas restaura el stock completo", async () => {
    const STOCK_INICIAL = 30;
    const CANTIDAD = 5;
    const PRECIO = 20;

    const productoId = await crearProductoTest(STOCK_INICIAL);
    let creditoId: number | null = null;
    pendingCleanups.push({ creditoId, productoId });

    const resCr = await request(app)
      .post("/api/creditos")
      .send({
        tipo: "credito",
        concepto: "TEST-005C",
        fechaFactura: new Date().toISOString().split("T")[0],
        nombreCliente: "Cliente Test",
        valorCredito: PRECIO * CANTIDAD,
        lineas: [
          {
            productoId,
            productoNombre: "Producto Test Stock",
            cantidad: CANTIDAD,
            precioVenta: PRECIO,
            precioCompra: 10,
          },
        ],
      });

    expect(resCr.status).toBe(201);
    creditoId = resCr.body.id as number;
    pendingCleanups[pendingCleanups.length - 1]!.creditoId = creditoId;

    expect(await leerStock(productoId)).toBe(STOCK_INICIAL - CANTIDAD);

    // Enviar lineas vacías elimina todas las lineas → debe restaurar todo el stock
    const resPut = await request(app)
      .put(`/api/creditos/${creditoId}`)
      .send({ valorCredito: 0, lineas: [] });

    expect(resPut.status).toBe(200);
    expect(await leerStock(productoId)).toBe(STOCK_INICIAL);

    await cleanupTest(creditoId, productoId);
    pendingCleanups.pop();
  });
});

// ── Escenario extra: filas de ventas generadas por abono no tocan stock ───────

describe("Escenario extra: DELETE ventas con creditoAbonoId no restaura stock", () => {
  it("eliminar la fila de venta de un abono NO modifica el stock del producto", async () => {
    const STOCK_INICIAL = 25;
    const CANTIDAD = 2;
    const PRECIO = 30;

    const productoId = await crearProductoTest(STOCK_INICIAL);
    let creditoId: number | null = null;
    pendingCleanups.push({ creditoId, productoId });

    const resCr = await request(app)
      .post("/api/creditos")
      .send({
        tipo: "credito",
        concepto: "TEST-EXT",
        fechaFactura: new Date().toISOString().split("T")[0],
        nombreCliente: "Cliente Test",
        valorCredito: PRECIO * CANTIDAD,
        lineas: [
          {
            productoId,
            productoNombre: "Producto Test Stock",
            cantidad: CANTIDAD,
            precioVenta: PRECIO,
            precioCompra: 10,
          },
        ],
      });

    expect(resCr.status).toBe(201);
    creditoId = resCr.body.id as number;
    pendingCleanups[pendingCleanups.length - 1]!.creditoId = creditoId;
    const lineaId: number = resCr.body.lineas[0].id;

    // Pagar completamente → crea una o mas filas en ventas_diarias con creditoAbonoId
    const resAbono = await request(app)
      .post(`/api/creditos/${creditoId}/abono`)
      .send({
        valor: PRECIO * CANTIDAD,
        lineas: [{ lineaId, valor: PRECIO * CANTIDAD }],
      });

    expect(resAbono.status).toBe(200);

    // Obtener el ID del abono registrado desde la respuesta del crédito actualizado
    const abonoId: number = resAbono.body.abonos[0].id;
    expect(abonoId).toBeGreaterThan(0);

    // Buscar directamente en BD las filas vinculadas al abono por su ID exacto
    const ventasAbono = await db
      .select({ id: ventasDiariasTable.id })
      .from(ventasDiariasTable)
      .where(eq(ventasDiariasTable.creditoAbonoId, abonoId));

    expect(ventasAbono.length).toBeGreaterThan(0);

    const stockAntesDel = await leerStock(productoId);
    expect(stockAntesDel).toBe(STOCK_INICIAL - CANTIDAD);

    // Eliminar solo las filas de venta de ESTE abono (identificadas por ID exacto)
    for (const { id } of ventasAbono) {
      await request(app).delete(`/api/ventas/${id}`);
    }

    // El stock NO debe haber cambiado: las filas tienen creditoAbonoId != null,
    // por lo que DELETE /ventas/:id omite la restauracion de stock en ese caso
    const stockDespuesDel = await leerStock(productoId);
    expect(stockDespuesDel).toBe(STOCK_INICIAL - CANTIDAD);

    // Cleanup (el crédito aún existe porque solo se borraron las filas de ventas)
    await cleanupTest(creditoId, productoId);
    pendingCleanups.pop();
  });
});
