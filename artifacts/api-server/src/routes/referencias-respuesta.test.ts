import "../lib/solo-base-de-pruebas";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
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
import {
  productosEnOrden,
  referenciasRespuestaProductos,
} from "./inventario-import";

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
  it("conserva las posiciones de productos ausentes sin desplazar referencias", () => {
    const productos = productosEnOrden(
      ["COD-A", "COD-FALTA", "COD-C"],
      [
        { codigo: "COD-A", id: 101 },
        { codigo: "COD-C", id: 303 },
      ],
    );

    expect(productos).toEqual([
      { codigo: "COD-A", id: 101 },
      { codigo: "COD-FALTA", id: null },
      { codigo: "COD-C", id: 303 },
    ]);
    expect(referenciasRespuestaProductos(productos)).toEqual([
      {
        campo: "_syncProductos.0.id",
        entidad: "producto",
        valorLocal: "101",
      },
      {
        campo: "_syncProductos.2.id",
        entidad: "producto",
        valorLocal: "303",
      },
    ]);
  });

  it("mapea los productos importados en el orden de entrada y no duplica el reintento", async () => {
    const operation = operationId();
    const items = [
      {
        codigo: `SYNC-${operation.slice(0, 8)}-B`,
        nombre: "Producto importado B",
        referencia: null,
        marca: null,
        precioCompra: "100",
        precioVentaSinIva: "200",
        precioVentaConIva: "238",
        cantidad: null,
      },
      {
        codigo: `SYNC-${operation.slice(0, 8)}-A`,
        nombre: "Producto importado A",
        referencia: null,
        marca: null,
        precioCompra: "100",
        precioVentaSinIva: "200",
        precioVentaConIva: "238",
        cantidad: null,
      },
    ];
    try {
      const creado = await request(app)
        .post("/api/inventario-import/confirmar-nuevos")
        .set("X-Operation-Id", operation)
        .send({ items });

      expect(creado.status).toBe(200);
      const productos = creado.body._syncProductos as Array<{
        codigo: string;
        id: number;
      }>;
      expect(productos.map(({ codigo }) => codigo)).toEqual(
        items.map(({ codigo }) => codigo),
      );
      expect(productos.every(({ id }) => Number.isInteger(id))).toBe(true);
      expect(await referencias(operation)).toEqual(
        productos.map((producto, index) => ({
          campo: `_syncProductos.${index}.id`,
          entidad: "producto",
          valorLocal: String(producto.id),
        })),
      );

      const repetido = await request(app)
        .post("/api/inventario-import/confirmar-nuevos")
        .set("X-Operation-Id", operation)
        .send({ items });
      expect(repetido.body.yaProcesado).toBe(true);
      expect(repetido.body._syncProductos).toBeUndefined();
      expect(
        await db
          .select({ id: productosTable.id })
          .from(productosTable)
          .where(inArray(productosTable.codigo, items.map(({ codigo }) => codigo))),
      ).toHaveLength(items.length);
    } finally {
      await db
        .delete(productosTable)
        .where(inArray(productosTable.codigo, items.map(({ codigo }) => codigo)));
    }
  });

  it("mapea los clientes importados en el orden de entrada y no duplica el reintento", async () => {
    const operation = operationId();
    const items = [
      { nombre: `Cliente B ${operation}`, telefono: null, telefono2: null, correo: null, notas: null },
      { nombre: `Cliente A ${operation}`, telefono: null, telefono2: null, correo: null, notas: null },
    ];
    try {
      const creado = await request(app)
        .post("/api/clientes-import/resolver-telefonos")
        .set("X-Operation-Id", operation)
        .send({ items });

      expect(creado.status).toBe(200);
      const clientes = creado.body._syncClientes as Array<{
        nombre: string;
        id: number;
      }>;
      expect(clientes.map(({ nombre }) => nombre)).toEqual(
        items.map(({ nombre }) => nombre),
      );
      expect(clientes.every(({ id }) => Number.isInteger(id))).toBe(true);
      expect(await referencias(operation)).toEqual(
        clientes.map((cliente, index) => ({
          campo: `_syncClientes.${index}.id`,
          entidad: "cliente",
          valorLocal: String(cliente.id),
        })),
      );

      const repetido = await request(app)
        .post("/api/clientes-import/resolver-telefonos")
        .set("X-Operation-Id", operation)
        .send({ items });
      expect(repetido.body.yaProcesado).toBe(true);
      expect(repetido.body._syncClientes).toBeUndefined();
      expect(
        await db
          .select({ id: clientesTable.id })
          .from(clientesTable)
          .where(inArray(clientesTable.nombre, items.map(({ nombre }) => nombre))),
      ).toHaveLength(items.length);
    } finally {
      await db
        .delete(clientesTable)
        .where(inArray(clientesTable.nombre, items.map(({ nombre }) => nombre)));
    }
  });

  it("devuelve IDs ordenados en todas las rutas de inventario que aplican filas", async () => {
    const operation = operationId();
    const codigos = [
      `SYNC-${operation.slice(0, 8)}-UPLOAD`,
      `SYNC-${operation.slice(0, 8)}-SYNC`,
      `SYNC-${operation.slice(0, 8)}-CONFIRM`,
      `SYNC-${operation.slice(0, 8)}-RESOLVE`,
      `SYNC-${operation.slice(0, 8)}-QUANTITY`,
      `SYNC-${operation.slice(0, 8)}-COMPLETE`,
    ];
    const item = (codigo: string) => ({
      codigo,
      nombre: `Producto ${codigo}`,
      referencia: null,
      marca: null,
      precioCompra: "100",
      precioVentaSinIva: "200",
      precioVentaConIva: "238",
      cantidad: null,
    });
    const libro = new ExcelJS.Workbook();
    libro.addWorksheet("Productos").addRows([
      [
        "CODIGO",
        "NOMBRE",
        "REFERENCIA",
        "REFERENCIA 2",
        "MARCA",
        "SE COMPRA",
        "SE VENDE A",
        "CANTIDAD",
      ],
      [codigos[0], "Producto importado", null, null, null, 100, 200, null],
    ]);

    try {
      const idExistente = await crearProducto(codigos[0]!);
      const importado = await request(app)
        .post("/api/inventario-import")
        .set("X-Operation-Id", operation)
        .attach(
          "archivo",
          Buffer.from(await libro.xlsx.writeBuffer()),
          "productos.xlsx",
        );
      expect(importado.status).toBe(200);
      expect(importado.body._syncProductos).toEqual([
        { codigo: codigos[0], id: idExistente },
      ]);
      expect(await referencias(operation)).toEqual([
        {
          campo: "_syncProductos.0.id",
          entidad: "producto",
          valorLocal: String(idExistente),
        },
      ]);

      const casos = [
        {
          endpoint: "/api/inventario-import/sincronizar",
          operationId: operationId(),
          body: { items: [item(codigos[1]!), item(`${codigos[1]}-2`)] },
          codigos: [codigos[1]!, `${codigos[1]}-2`],
        },
        {
          endpoint: "/api/inventario-import/confirmar-nuevos",
          operationId: operationId(),
          body: { items: [item(codigos[2]!)] },
          codigos: [codigos[2]!],
        },
        {
          endpoint: "/api/inventario-import/resolver",
          operationId: operationId(),
          body: { items: [item(codigos[3]!)] },
          codigos: [codigos[3]!],
        },
        {
          endpoint: "/api/inventario-import/resolver-cantidades",
          operationId: operationId(),
          body: {
            modo: "reemplazar",
            items: [{ codigo: codigos[4], cantidadArchivo: 3 }],
          },
          codigos: [codigos[4]!],
        },
        {
          endpoint: "/api/inventario-import/aplicar-completo",
          operationId: operationId(),
          body: {
            filas: [
              {
                codigo: codigos[5],
                nombre: `Producto ${codigos[5]}`,
                marca: null,
                tipo: null,
                referencia: null,
                adicional: null,
                precioCompra: 100,
                precioVentaSinIva: 200,
                tieneIva: false,
                stockLocal: 1,
                stockBodega: 0,
                stockMinimo: 0,
              },
            ],
          },
          codigos: [codigos[5]!],
        },
      ];
      await crearProducto(codigos[4]!);
      for (const caso of casos) {
        const respuesta = await request(app)
          .post(caso.endpoint)
          .set("X-Operation-Id", caso.operationId)
          .send(caso.body);
        expect(respuesta.status).toBe(200);
        const productos = respuesta.body._syncProductos as Array<{
          codigo: string;
          id: number;
        }>;
        expect(productos.length).toBeGreaterThan(0);
        expect(productos.map(({ codigo }) => codigo)).toEqual(caso.codigos);
        if (caso.endpoint === "/api/inventario-import/sincronizar") {
          expect(await referencias(caso.operationId)).toBeUndefined();
        } else {
          expect(await referencias(caso.operationId)).toEqual(
            productos.map((producto, index) => ({
              campo: `_syncProductos.${index}.id`,
              entidad: "producto",
              valorLocal: String(producto.id),
            })),
          );
        }
      }
    } finally {
      await db
        .delete(productosTable)
        .where(inArray(productosTable.codigo, codigos));
    }
  });

  it("devuelve clientes en orden tanto al importar Excel como al aplicar el payload", async () => {
    const operation = operationId();
    const nombres = [
      `Cliente Excel B ${operation}`,
      `Cliente Excel A ${operation}`,
      `Cliente payload B ${operation}`,
      `Cliente payload A ${operation}`,
    ];
    const libro = new ExcelJS.Workbook();
    libro.addWorksheet("Clientes").addRows([
      ["NOMBRE", "TELEFONO", "CORREO", "NOTAS"],
      [nombres[0], null, null, null],
      [nombres[1], null, null, null],
    ]);
    try {
      const importado = await request(app)
        .post("/api/clientes-import")
        .set("X-Operation-Id", operation)
        .attach(
          "archivo",
          Buffer.from(await libro.xlsx.writeBuffer()),
          "clientes.xlsx",
        );
      expect(importado.status).toBe(200);
      const clientesExcel = importado.body._syncClientes as Array<{
        nombre: string;
        id: number;
      }>;
      expect(clientesExcel.map(({ nombre }) => nombre)).toEqual(nombres.slice(0, 2));
      expect(await referencias(operation)).toEqual(
        clientesExcel.map((cliente, index) => ({
          campo: `_syncClientes.${index}.id`,
          entidad: "cliente",
          valorLocal: String(cliente.id),
        })),
      );

      const operationSync = operationId();
      const respuestaSync = await request(app)
        .post("/api/clientes-import/sincronizar")
        .set("X-Operation-Id", operationSync)
        .send({
          items: nombres.slice(2).map((nombre) => ({
            nombre,
            telefono: null,
            telefono2: null,
            correo: null,
            notas: null,
          })),
        });
      expect(respuestaSync.status).toBe(200);
      const clientesSync = respuestaSync.body._syncClientes as Array<{
        nombre: string;
        id: number;
      }>;
      expect(clientesSync.map(({ nombre }) => nombre)).toEqual(nombres.slice(2));
    } finally {
      await db
        .delete(clientesTable)
        .where(inArray(clientesTable.nombre, nombres));
    }
  });

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
    const operationCompraLote = operationId();
    const productoId = await crearProducto(`SYNC-COMPRA-${operationIndividual}`);
    const compraIds: number[] = [];
    try {
      const compra = await request(app)
        .post("/api/compras")
        .set("X-Operation-Id", operationCompra)
        .send({ productoId });
      expect(compra.status).toBe(201);
      compraIds.push(compra.body.id as number);

      const llegada = await request(app)
        .put(`/api/compras/${compraIds[0]}`)
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

      const compraLote = await request(app)
        .post("/api/compras")
        .set("X-Operation-Id", operationCompraLote)
        .send({ productoId });
      expect(compraLote.status).toBe(201);
      compraIds.push(compraLote.body.id as number);

      const lote = await request(app)
        .post("/api/compras/lote-llegada")
        .set("X-Operation-Id", operationLote)
        .send({
          proveedor: "Proveedor sync",
          fechaLlegada: "2026-10-30",
          items: [{
            id: compraIds[1],
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
      if (compraIds.length > 0) {
        await db.delete(historialPreciosTable).where(
          inArray(historialPreciosTable.compraId, compraIds),
        );
        await db.delete(comprasTable).where(inArray(comprasTable.id, compraIds));
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
