import "../lib/solo-base-de-pruebas";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { db } from "@workspace/db";
import {
  abonosCreditosTable,
  comprasTable,
  creditoLineasTable,
  creditosTable,
  distribucionesTable,
  eventosSincronizacionTable,
  historialPreciosTable,
  manoObraTable,
  operacionesSincronizadasTable,
  productosTable,
  vehiculosClienteTable,
  clientesTable,
  ventasDiariasTable,
  trabajadoresTable,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import app from "../app";

const operaciones = new Set<string>();
const creditoIds = new Set<number>();
const lineaIds = new Set<number>();
const abonoIds = new Set<number>();
const ventaIds = new Set<number>();
const manoObraIds = new Set<number>();
const distribucionIds = new Set<number>();
const compraIds = new Set<number>();
const historialIds = new Set<number>();
const clienteIds = new Set<number>();
const vehiculoIds = new Set<number>();
const productoIds = new Set<number>();
const trabajadorIds = new Set<number>();

function operationId(): string {
  const id = randomUUID();
  operaciones.add(id);
  return id;
}

async function crearProducto() {
  const [producto] = await db.insert(productosTable).values({
    nombre: `Producto borrado ${randomUUID()}`,
    codigo: `BORRADO-${randomUUID()}`,
    precioCompra: "100",
    precioVentaSinIva: "200",
    precioVentaConIva: "238",
  }).returning({ id: productosTable.id });
  productoIds.add(producto.id);
  return producto.id;
}

async function crearTrabajador() {
  const [trabajador] = await db.insert(trabajadoresTable).values({
    nombre: `Trabajador borrado ${randomUUID()}`,
    totalGanado: "50",
  }).returning({ id: trabajadoresTable.id });
  trabajadorIds.add(trabajador.id);
  return trabajador.id;
}

async function crearVenta(datos: {
  productoId?: number;
  creditoAbonoId?: number;
  manoObraId?: number;
  origen?: string;
  referencia: string;
}) {
  const [venta] = await db.insert(ventasDiariasTable).values({
    fecha: new Date().toISOString().slice(0, 10),
    referencia: datos.referencia,
    productoId: datos.productoId ?? null,
    creditoAbonoId: datos.creditoAbonoId ?? null,
    manoObraId: datos.manoObraId ?? null,
    origen: datos.origen ?? "venta_normal",
    productoNombre: "Registro de prueba",
    cantidad: "1",
    precioVentaUnidad: "100",
    precioVentaTotal: "100",
    afectaInventario: false,
  }).returning({ id: ventasDiariasTable.id });
  ventaIds.add(venta.id);
  return venta.id;
}

async function crearHistorial(productoId: number, compraId: number | null) {
  const [historial] = await db.insert(historialPreciosTable).values({
    productoId,
    productoNombre: "Producto de prueba",
    precioCompra: "100",
    precioVenta: "200",
    fecha: new Date().toISOString().slice(0, 10),
    compraId,
  }).returning({ id: historialPreciosTable.id });
  historialIds.add(historial.id);
  return historial.id;
}

async function crearCompra(productoId: number) {
  const [compra] = await db.insert(comprasTable).values({
    productoId,
    productoNombre: "Producto de prueba",
    productoCodigo: `COMPRA-${randomUUID()}`,
    stockActual: "0",
    stockMinimo: "0",
  }).returning({ id: comprasTable.id });
  compraIds.add(compra.id);
  return compra.id;
}

afterEach(async () => {
  const operationIds = [...operaciones];
  const credits = [...creditoIds];
  const lines = [...lineaIds];
  const abonos = [...abonoIds];
  const sales = [...ventaIds];
  const labor = [...manoObraIds];
  const distributions = [...distribucionIds];
  const purchases = [...compraIds];
  const histories = [...historialIds];
  const clients = [...clienteIds];
  const vehicles = [...vehiculoIds];
  const products = [...productoIds];
  const workers = [...trabajadorIds];

  for (const ids of [
    operaciones,
    creditoIds,
    lineaIds,
    abonoIds,
    ventaIds,
    manoObraIds,
    distribucionIds,
    compraIds,
    historialIds,
    clienteIds,
    vehiculoIds,
    productoIds,
    trabajadorIds,
  ]) ids.clear();

  if (operationIds.length) {
    await db.delete(eventosSincronizacionTable).where(
      inArray(eventosSincronizacionTable.operationId, operationIds),
    );
    await db.delete(operacionesSincronizadasTable).where(
      inArray(operacionesSincronizadasTable.operationId, operationIds),
    );
  }
  if (sales.length) {
    await db.delete(ventasDiariasTable).where(inArray(ventasDiariasTable.id, sales));
  }
  if (distributions.length) {
    await db.delete(distribucionesTable).where(
      inArray(distribucionesTable.id, distributions),
    );
  }
  if (labor.length) {
    await db.delete(manoObraTable).where(inArray(manoObraTable.id, labor));
  }
  if (lines.length) {
    await db.delete(creditoLineasTable).where(inArray(creditoLineasTable.id, lines));
  }
  if (abonos.length) {
    await db.delete(abonosCreditosTable).where(inArray(abonosCreditosTable.id, abonos));
  }
  if (credits.length) {
    await db.delete(creditosTable).where(inArray(creditosTable.id, credits));
  }
  if (histories.length) {
    await db.delete(historialPreciosTable).where(
      inArray(historialPreciosTable.id, histories),
    );
  }
  if (purchases.length) {
    await db.delete(comprasTable).where(inArray(comprasTable.id, purchases));
  }
  if (vehicles.length) {
    await db.delete(vehiculosClienteTable).where(
      inArray(vehiculosClienteTable.id, vehicles),
    );
  }
  if (clients.length) {
    await db.delete(clientesTable).where(inArray(clientesTable.id, clients));
  }
  if (products.length) {
    await db.delete(historialPreciosTable).where(
      inArray(historialPreciosTable.productoId, products),
    );
    await db.delete(comprasTable).where(inArray(comprasTable.productoId, products));
    await db.delete(ventasDiariasTable).where(
      inArray(ventasDiariasTable.productoId, products),
    );
    await db.delete(productosTable).where(inArray(productosTable.id, products));
  }
  if (workers.length) {
    await db.delete(trabajadoresTable).where(
      inArray(trabajadoresTable.id, workers),
    );
  }
});

describe("borrados con llaves foráneas activas", () => {
  it("elimina un crédito con líneas, abonos, ventas y mano de obra distribuida", async () => {
    const productoId = await crearProducto();
    const trabajadorId = await crearTrabajador();
    const [credito] = await db.insert(creditosTable).values({
      tipo: "credito",
      concepto: `BORRADO-${randomUUID()}`,
      fechaFactura: new Date().toISOString().slice(0, 10),
      nombreCliente: "Cliente de prueba",
      valorCredito: "100",
      valorAbonado: "100",
    }).returning({ id: creditosTable.id });
    creditoIds.add(credito.id);
    const [linea] = await db.insert(creditoLineasTable).values({
      creditoId: credito.id,
      productoId,
      cantidad: "1",
      productoNombre: "Producto de prueba",
      precioVenta: "100",
    }).returning({ id: creditoLineasTable.id });
    lineaIds.add(linea.id);
    const [abono] = await db.insert(abonosCreditosTable).values({
      creditoId: credito.id,
      fecha: new Date().toISOString().slice(0, 10),
      valorTotal: "100",
    }).returning({ id: abonosCreditosTable.id });
    abonoIds.add(abono.id);
    const [labor] = await db.insert(manoObraTable).values({
      fecha: new Date().toISOString().slice(0, 10),
      descripcion: "Mano de obra de prueba",
      valorTotal: "50",
      creditoId: credito.id,
    }).returning({ id: manoObraTable.id });
    manoObraIds.add(labor.id);
    const [distribution] = await db.insert(distribucionesTable).values({
      manoObraId: labor.id,
      trabajadorId,
      trabajadorNombre: "Trabajador de prueba",
      valor: "50",
    }).returning({ id: distribucionesTable.id });
    distribucionIds.add(distribution.id);
    const saleId = await crearVenta({
      referencia: `ABONO-${abono.id}`,
      creditoAbonoId: abono.id,
      manoObraId: labor.id,
      origen: "abono_credito",
    });

    const response = await request(app)
      .delete(`/api/creditos/${credito.id}`)
      .set("x-operation-id", operationId());

    expect(response.status).toBe(200);
    expect(await db.select().from(creditoLineasTable).where(eq(creditoLineasTable.id, linea.id))).toHaveLength(0);
    expect(await db.select().from(abonosCreditosTable).where(eq(abonosCreditosTable.id, abono.id))).toHaveLength(0);
    expect(await db.select().from(ventasDiariasTable).where(eq(ventasDiariasTable.id, saleId))).toHaveLength(0);
    expect(await db.select().from(distribucionesTable).where(eq(distribucionesTable.id, distribution.id))).toHaveLength(0);
    expect(await db.select().from(manoObraTable).where(eq(manoObraTable.id, labor.id))).toHaveLength(0);
    expect(await db.select().from(creditosTable).where(eq(creditosTable.id, credito.id))).toHaveLength(0);
    const [trabajador] = await db.select().from(trabajadoresTable).where(eq(trabajadoresTable.id, trabajadorId));
    expect(trabajador.totalGanado).toBe("0.00");
  });

  it("desvincula mano de obra al borrar la venta asociada", async () => {
    const laborDate = new Date().toISOString().slice(0, 10);
    const [labor] = await db.insert(manoObraTable).values({
      fecha: laborDate,
      descripcion: "Mano de obra vinculada a venta",
      valorTotal: "50",
    }).returning({ id: manoObraTable.id });
    manoObraIds.add(labor.id);
    const saleId = await crearVenta({
      referencia: `VENTA-${randomUUID()}`,
    });
    await db.update(manoObraTable).set({ ventaId: saleId }).where(eq(manoObraTable.id, labor.id));

    const response = await request(app)
      .delete(`/api/ventas/${saleId}`)
      .set("x-operation-id", operationId());

    expect(response.status).toBe(200);
    expect(await db.select().from(ventasDiariasTable).where(eq(ventasDiariasTable.id, saleId))).toHaveLength(0);
    const [updatedLabor] = await db.select().from(manoObraTable).where(eq(manoObraTable.id, labor.id));
    expect(updatedLabor.ventaId).toBeNull();
  });

  it("desvincula la venta al borrar mano de obra y conserva sus distribuciones eliminadas", async () => {
    const trabajadorId = await crearTrabajador();
    const [labor] = await db.insert(manoObraTable).values({
      fecha: new Date().toISOString().slice(0, 10),
      descripcion: "Mano de obra de prueba",
      valorTotal: "50",
    }).returning({ id: manoObraTable.id });
    manoObraIds.add(labor.id);
    const [distribution] = await db.insert(distribucionesTable).values({
      manoObraId: labor.id,
      trabajadorId,
      trabajadorNombre: "Trabajador de prueba",
      valor: "50",
    }).returning({ id: distribucionesTable.id });
    distribucionIds.add(distribution.id);
    const saleId = await crearVenta({
      referencia: `VENTA-MO-${randomUUID()}`,
      manoObraId: labor.id,
    });

    const response = await request(app)
      .delete(`/api/manoobra/${labor.id}`)
      .set("x-operation-id", operationId());

    expect(response.status).toBe(200);
    expect(await db.select().from(distribucionesTable).where(eq(distribucionesTable.id, distribution.id))).toHaveLength(0);
    expect(await db.select().from(manoObraTable).where(eq(manoObraTable.id, labor.id))).toHaveLength(0);
    const [updatedSale] = await db.select().from(ventasDiariasTable).where(eq(ventasDiariasTable.id, saleId));
    expect(updatedSale.manoObraId).toBeNull();
  });

  it("desvincula historial de precios al borrar la compra", async () => {
    const productoId = await crearProducto();
    const compraId = await crearCompra(productoId);
    const historialId = await crearHistorial(productoId, compraId);

    const response = await request(app)
      .delete(`/api/compras/${compraId}`)
      .set("x-operation-id", operationId());

    expect(response.status).toBe(200);
    expect(await db.select().from(comprasTable).where(eq(comprasTable.id, compraId))).toHaveLength(0);
    const [historial] = await db.select().from(historialPreciosTable).where(eq(historialPreciosTable.id, historialId));
    expect(historial.compraId).toBeNull();
    expect(historial.productoId).toBe(productoId);
  });

  it("elimina los vehículos junto con el cliente", async () => {
    const [cliente] = await db.insert(clientesTable).values({
      nombre: `Cliente borrado ${randomUUID()}`,
    }).returning({ id: clientesTable.id });
    clienteIds.add(cliente.id);
    const [vehiculo] = await db.insert(vehiculosClienteTable).values({
      clienteId: cliente.id,
      placa: `TEST-${cliente.id}`,
    }).returning({ id: vehiculosClienteTable.id });
    vehiculoIds.add(vehiculo.id);

    const response = await request(app)
      .delete(`/api/clientes/${cliente.id}`)
      .set("x-operation-id", operationId());

    expect(response.status).toBe(200);
    expect(await db.select().from(clientesTable).where(eq(clientesTable.id, cliente.id))).toHaveLength(0);
    expect(await db.select().from(vehiculosClienteTable).where(eq(vehiculosClienteTable.id, vehiculo.id))).toHaveLength(0);
  });

  it("desactiva el producto y conserva compras, ventas e historial relacionados", async () => {
    const productoId = await crearProducto();
    const compraId = await crearCompra(productoId);
    const historialId = await crearHistorial(productoId, compraId);
    const saleId = await crearVenta({
      productoId,
      referencia: `VENTA-PRODUCTO-${randomUUID()}`,
    });

    const response = await request(app)
      .delete(`/api/inventario/${productoId}`)
      .set("x-operation-id", operationId());

    expect(response.status).toBe(200);
    const [producto] = await db.select().from(productosTable).where(eq(productosTable.id, productoId));
    expect(producto.activo).toBe(false);
    const [compra] = await db.select().from(comprasTable).where(eq(comprasTable.id, compraId));
    const [venta] = await db.select().from(ventasDiariasTable).where(eq(ventasDiariasTable.id, saleId));
    expect(await db.select().from(historialPreciosTable).where(eq(historialPreciosTable.id, historialId))).toHaveLength(1);
    expect(compra.productoId).toBe(productoId);
    expect(venta.productoId).toBe(productoId);
    const [historial] = await db.select().from(historialPreciosTable).where(eq(historialPreciosTable.id, historialId));
    expect(historial.compraId).toBe(compraId);
    expect(historial.productoId).toBe(productoId);
  });
});
