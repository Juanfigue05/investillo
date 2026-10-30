import "../lib/solo-base-de-pruebas";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { db } from "@workspace/db";
import {
  abonosCreditosTable,
  clientesTable,
  comprasTable,
  descuentosInventarioTable,
  distribucionesTable,
  eventosSincronizacionTable,
  historialPreciosTable,
  manoObraTable,
  operacionesSincronizadasTable,
  productosTable,
  trabajadoresTable,
  vehiculosClienteTable,
  ventasDiariasTable,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import app from "../app";

const operationIds = new Set<string>();
type ReferenciaRespuestaTest = {
  campo: string;
  entidad: string;
  valorLocal: string;
};

afterEach(async () => {
  if (operationIds.size === 0) return;
  const ids = [...operationIds];
  operationIds.clear();
  await db.delete(eventosSincronizacionTable).where(
    inArray(eventosSincronizacionTable.operationId, ids),
  );
  await db.delete(operacionesSincronizadasTable).where(
    inArray(operacionesSincronizadasTable.operationId, ids),
  );
});

function operationId(): string {
  const id = randomUUID();
  operationIds.add(id);
  return id;
}

async function referencias(id: string) {
  const [evento] = await db
    .select({ referencias: eventosSincronizacionTable.referenciasRespuesta })
    .from(eventosSincronizacionTable)
    .where(eq(eventosSincronizacionTable.operationId, id));
  return evento?.referencias as
    | ReferenciaRespuestaTest[]
    | null
    | undefined;
}

async function crearProducto(codigo: string) {
  const [producto] = await db.insert(productosTable).values({
    nombre: `Producto ${codigo}`,
    codigo,
    precioCompra: "100",
    precioVentaSinIva: "200",
    precioVentaConIva: "238",
    stockActual: "20",
    stockLocal: "20",
    stockBodega: "0",
    stockMinimo: "0",
  }).returning({ id: productosTable.id });
  return producto.id;
}

describe("referencias de respuesta en filas secundarias", () => {
  it("mapea los vehículos creados junto con un cliente", async () => {
    const operation = operationId();
    let clienteId: number | undefined;
    try {
      const creado = await request(app)
        .post("/api/clientes")
        .set("X-Operation-Id", operation)
        .send({
          nombre: `Cliente sync ${operation}`,
          vehiculos: [
            { placa: `SYNC-${operation.slice(0, 6)}-A` },
            { placa: `SYNC-${operation.slice(0, 6)}-B` },
          ],
        });

      expect(creado.status).toBe(201);
      clienteId = creado.body.id as number;
      const vehiculos = creado.body.vehiculos as Array<{ id: number }>;
      expect(vehiculos).toHaveLength(2);
      expect(await referencias(operation)).toEqual([
        {
          campo: "vehiculos.0.id",
          entidad: "vehiculo",
          valorLocal: String(vehiculos[0]?.id),
        },
        {
          campo: "vehiculos.1.id",
          entidad: "vehiculo",
          valorLocal: String(vehiculos[1]?.id),
        },
      ]);
    } finally {
      if (clienteId !== undefined) {
        await db.delete(vehiculosClienteTable).where(
          eq(vehiculosClienteTable.clienteId, clienteId),
        );
        await db.delete(clientesTable).where(eq(clientesTable.id, clienteId));
      }
    }
  });

  it("mapea la mano de obra secundaria y las ventas de un lote", async () => {
    const operationManual = operationId();
    const operationLote = operationId();
    let manoObraId: number | undefined;
    let ventaManualId: number | undefined;
    let ventasLoteIds: number[] = [];
    try {
      const manoObra = await request(app)
        .post("/api/ventas/manoobra")
        .set("X-Operation-Id", operationManual)
        .send({
          fecha: "2026-10-30",
          referencia: `SYNC-MO-${operationManual}`,
          valorTotal: 70000,
          distribuciones: [],
        });

      expect(manoObra.status).toBe(201);
      ventaManualId = manoObra.body.id as number;
      manoObraId = manoObra.body._syncManoObraId as number;
      expect(manoObraId).toBeGreaterThan(0);
      expect(await referencias(operationManual)).toEqual([
        {
          campo: "_syncManoObraId",
          entidad: "mano_obra",
          valorLocal: String(manoObraId),
        },
      ]);

      const lote = await request(app)
        .post("/api/ventas/lote-pago-antiguo")
        .set("X-Operation-Id", operationLote)
        .send({
          items: ["A", "B"].map((sufijo) => ({
            fecha: "2026-10-30",
            referencia: `SYNC-LOTE-${operationLote}-${sufijo}`,
            productoNombre: `Servicio ${sufijo}`,
            tipoLinea: "manoobra",
            cantidad: 1,
            precioCompraUnidad: 0,
            precioVentaUnidad: 30000,
            precioVentaTotal: 30000,
            beneficio: 30000,
          })),
        });

      expect(lote.status).toBe(201);
      ventasLoteIds = (lote.body as Array<{ id: number }>).map(({ id }) => id);
      expect(ventasLoteIds).toHaveLength(2);
      expect(await referencias(operationLote)).toEqual(
        ventasLoteIds.map((id, index) => ({
          campo: `${index}.id`,
          entidad: "venta",
          valorLocal: String(id),
        })),
      );
    } finally {
      if (manoObraId !== undefined) {
        await db.update(manoObraTable).set({ ventaId: null }).where(
          eq(manoObraTable.id, manoObraId),
        );
        await db.delete(distribucionesTable).where(
          eq(distribucionesTable.manoObraId, manoObraId),
        );
        await db.delete(manoObraTable).where(eq(manoObraTable.id, manoObraId));
      }
      const ventasAEliminar = [
        ...(ventaManualId === undefined ? [] : [ventaManualId]),
        ...ventasLoteIds,
      ];
      if (ventasAEliminar.length > 0) {
        await db.update(ventasDiariasTable).set({ manoObraId: null }).where(
          inArray(ventasDiariasTable.id, ventasAEliminar),
        );
        await db.delete(ventasDiariasTable).where(
          inArray(ventasDiariasTable.id, ventasAEliminar),
        );
      }
    }
  });

  it("mapea las filas históricas creadas al recibir compras individuales y por lote", async () => {
    const operationCompra = operationId();
    const operationIndividual = operationId();
    const operationLote = operationId();
    const productoId = await crearProducto(`SYNC-COMPRA-${operationIndividual}`);
    let compraId: number | undefined;
    try {
      const compra = await request(app)
        .post("/api/compras")
        .set("X-Operation-Id", operationCompra)
        .send({ productoId });
      expect(compra.status).toBe(201);
      compraId = compra.body.id as number;

      const llegada = await request(app)
        .put(`/api/compras/${compraId}`)
        .set("X-Operation-Id", operationIndividual)
        .send({
          estado: "llegado",
          cantidadRecibida: 1,
          cantidadLocal: 1,
          cantidadBodega: 0,
          nuevoPrecioCompra: 120,
          nuevoPrecioVentaSinIva: 250,
          tieneIva: true,
        });

      expect(llegada.status).toBe(200);
      expect(llegada.body._syncHistorialPrecioId).toBeGreaterThan(0);
      expect(await referencias(operationIndividual)).toEqual([
        {
          campo: "_syncHistorialPrecioId",
          entidad: "historial_precios",
          valorLocal: String(llegada.body._syncHistorialPrecioId),
        },
      ]);

      const lote = await request(app)
        .post("/api/compras/lote-llegada")
        .set("X-Operation-Id", operationLote)
        .send({
          proveedor: "Proveedor sync",
          fechaLlegada: "2026-10-30",
          items: [{
            id: compraId,
            cantidadRecibida: 1,
            cantidadLocal: 1,
            cantidadBodega: 0,
            nuevoPrecioCompra: 130,
            nuevoPrecioVentaSinIva: 260,
            tieneIva: true,
            actualizarPrecioInventario: true,
          }],
        });

      expect(lote.status).toBe(200);
      const historialId = lote.body.resultados[0]._syncHistorialPrecioId as number;
      expect(historialId).toBeGreaterThan(0);
      expect(await referencias(operationLote)).toEqual([
        {
          campo: "resultados.0._syncHistorialPrecioId",
          entidad: "historial_precios",
          valorLocal: String(historialId),
        },
      ]);
    } finally {
      if (compraId !== undefined) {
        await db.delete(historialPreciosTable).where(
          eq(historialPreciosTable.compraId, compraId),
        );
        await db.delete(comprasTable).where(eq(comprasTable.id, compraId));
      }
      await db.delete(productosTable).where(eq(productosTable.id, productoId));
    }
  });

  it("mapea cada descuento creado en una operación por lote", async () => {
    const operation = operationId();
    const productoIds = [
      await crearProducto(`SYNC-DESC-A-${operation}`),
      await crearProducto(`SYNC-DESC-B-${operation}`),
    ];
    let descuentoIds: number[] = [];
    try {
      const resultado = await request(app)
        .post("/api/descuentos-inventario")
        .set("X-Operation-Id", operation)
        .send({
          motivo: "Pérdida",
          observacion: "Prueba de referencias",
          items: productoIds.map((productoId) => ({
            productoId,
            cantidad: 0.25,
          })),
        });

      expect(resultado.status).toBe(201);
      descuentoIds = (resultado.body as Array<{ id: number }>).map(
        ({ id }) => id,
      );
      expect(descuentoIds).toHaveLength(2);
      expect(await referencias(operation)).toEqual(
        descuentoIds.map((id, index) => ({
          campo: `${index}.id`,
          entidad: "descuento_inventario",
          valorLocal: String(id),
        })),
      );
    } finally {
      if (descuentoIds.length > 0) {
        await db.delete(descuentosInventarioTable).where(
          inArray(descuentosInventarioTable.id, descuentoIds),
        );
      }
      await db.delete(productosTable).where(
        inArray(productosTable.id, productoIds),
      );
    }
  });

  it("mapea las ventas generadas al crear y abonar un crédito", async () => {
    const operationCredito = operationId();
    const operationAbono = operationId();
    const operationActualizarCredito = operationId();
    const operationActualizarAbono = operationId();
    const fecha = "2026-10-30";
    let creditoId: number | undefined;
    let trabajadorId: number | undefined;
    try {
      const [trabajador] = await db.insert(trabajadoresTable).values({
        nombre: `Trabajador sync ${operationCredito}`,
      }).returning({ id: trabajadoresTable.id });
      trabajadorId = trabajador.id;
      const creado = await request(app)
        .post("/api/creditos")
        .set("X-Operation-Id", operationCredito)
        .send({
          tipo: "credito",
          concepto: `SYNC-CREDITO-${operationCredito}`,
          fechaFactura: fecha,
          nombreCliente: "Cliente sync",
          valorCredito: 100,
          valorAbonado: 25,
          abonoInicialFecha: fecha,
          manoObra: {
            valor: 100,
            trabajadores: [{ id: trabajadorId, valor: 100 }],
          },
          lineas: [{
            productoNombre: "Servicio de prueba",
            cantidad: 1,
            precioVenta: 100,
            precioCompra: 0,
            valorAbonado: 25,
          }],
        });

      expect(creado.status).toBe(201);
      creditoId = creado.body.id as number;
      const ventaInicial = creado.body._syncVentasGeneradas[0].id as number;
      expect(ventaInicial).toBeGreaterThan(0);
      expect(await referencias(operationCredito)).toEqual(
        expect.arrayContaining([
          {
            campo: "_syncManoObraId",
            entidad: "mano_obra",
            valorLocal: String(creado.body._syncManoObraId),
          },
          {
            campo: "_syncVentasGeneradas.0.id",
            entidad: "venta",
            valorLocal: String(ventaInicial),
          },
        ]),
      );

      const lineaId = creado.body.lineas[0].id as number;
      const abono = await request(app)
        .post(`/api/creditos/${creditoId}/abono`)
        .set("X-Operation-Id", operationAbono)
        .send({
          valor: 25,
          lineas: [{ lineaId, valor: 25 }],
          fechaAbono: fecha,
          fechaVentaDiaria: fecha,
        });

      expect(abono.status).toBe(200);
      const referenciasAbono = await referencias(operationAbono);
      expect(referenciasAbono).toHaveLength(1);
      expect(referenciasAbono?.[0]).toMatchObject({
        campo: "_syncVentasGeneradas.0.id",
        entidad: "venta",
      });
      expect(abono.body._syncVentasGeneradas[0].id).toBe(
        Number(referenciasAbono?.[0]?.valorLocal),
      );

      const linea = abono.body.lineas[0] as {
        id: number;
        productoNombre: string;
        cantidad: number;
        precioVenta: number;
        precioCompra: number;
        valorAbonado: number;
      };
      const creditoEditado = await request(app)
        .put(`/api/creditos/${creditoId}`)
        .set("X-Operation-Id", operationActualizarCredito)
        .send({
          valorCredito: 100,
          valorAbonado: linea.valorAbonado,
          lineas: [{
            id: linea.id,
            productoNombre: linea.productoNombre,
            cantidad: linea.cantidad,
            precioVenta: linea.precioVenta,
            precioCompra: linea.precioCompra,
            valorAbonado: linea.valorAbonado,
          }],
        });

      expect(creditoEditado.status).toBe(200);
      const ventasReconstruidas = creditoEditado.body
        ._syncVentasGeneradas as Array<{ id: number }>;
      expect(ventasReconstruidas.length).toBeGreaterThan(0);
      expect(await referencias(operationActualizarCredito)).toEqual(
        ventasReconstruidas.map((venta, index) => ({
          campo: `_syncVentasGeneradas.${index}.id`,
          entidad: "venta",
          valorLocal: String(venta.id),
        })),
      );

      const abonoId = abono.body._syncNuevoAbonoId as number;
      const abonoEditado = await request(app)
        .put(`/api/creditos/${creditoId}/abono/${abonoId}`)
        .set("X-Operation-Id", operationActualizarAbono)
        .send({
          valor: 30,
          lineas: [{ lineaId: linea.id, valor: 30 }],
          fechaAbono: fecha,
          fechaVentaDiaria: fecha,
        });

      expect(abonoEditado.status).toBe(200);
      const ventasTrasAbonoEditado = abonoEditado.body
        ._syncVentasGeneradas as Array<{ id: number }>;
      expect(ventasTrasAbonoEditado.length).toBeGreaterThan(0);
      expect(await referencias(operationActualizarAbono)).toEqual(
        ventasTrasAbonoEditado.map((venta, index) => ({
          campo: `_syncVentasGeneradas.${index}.id`,
          entidad: "venta",
          valorLocal: String(venta.id),
        })),
      );
    } finally {
      if (creditoId !== undefined) {
        await request(app).delete(`/api/creditos/${creditoId}`);
        await db.delete(ventasDiariasTable).where(
          eq(ventasDiariasTable.referencia, `SYNC-CREDITO-${operationCredito}`),
        );
        await db.delete(abonosCreditosTable).where(
          eq(abonosCreditosTable.creditoId, creditoId),
        );
      }
      if (trabajadorId !== undefined) {
        await db.delete(trabajadoresTable).where(
          eq(trabajadoresTable.id, trabajadorId),
        );
      }
    }
  });
});
