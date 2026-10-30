import "../lib/solo-base-de-pruebas";
import ExcelJS from "exceljs";
import express from "express";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { db } from "@workspace/db";
import {
  clientesTable,
  eventosSincronizacionTable,
  operacionesSincronizadasTable,
  productosTable,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";

vi.stubEnv("SYNC_CAPTURE_REMOTE", "true");
const { default: apiApp } = await import("../app");
const { capturarCambiosRemotos } = await import("./capturar-cambios-remotos");

const operationIds = new Set<string>();
const productCodes = new Set<string>();
const customerNames = new Set<string>();

beforeEach(() => {
  vi.stubEnv("SYNC_CAPTURE_REMOTE", "true");
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  const ids = [...operationIds];
  const codes = [...productCodes];
  const names = [...customerNames];
  operationIds.clear();
  productCodes.clear();
  customerNames.clear();
  if (ids.length > 0) {
    await db.delete(eventosSincronizacionTable).where(
      inArray(eventosSincronizacionTable.operationId, ids),
    );
    await db.delete(operacionesSincronizadasTable).where(
      inArray(operacionesSincronizadasTable.operationId, ids),
    );
  }
  if (codes.length > 0) {
    await db.delete(productosTable).where(inArray(productosTable.codigo, codes));
  }
  if (names.length > 0) {
    await db.delete(clientesTable).where(inArray(clientesTable.nombre, names));
  }
});

function operationId(): string {
  const id = randomUUID();
  operationIds.add(id);
  return id;
}

async function workbookBuffer(
  sheetName: string,
  rows: unknown[][],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet(sheetName).addRows(rows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function esperarEvento(id: string) {
  await vi.waitFor(async () => {
    const [evento] = await db
      .select()
      .from(eventosSincronizacionTable)
      .where(eq(eventosSincronizacionTable.operationId, id));
    expect(evento).toBeDefined();
  });
  const [evento] = await db
    .select()
    .from(eventosSincronizacionTable)
    .where(eq(eventosSincronizacionTable.operationId, id));
  return evento!;
}

describe("captura remota multipart", () => {
  it("preserva el payload y las referencias de las dos importaciones Excel", async () => {
    const idProducto = operationId();
    const codigo = `CAPTURE-${idProducto.slice(0, 8)}`;
    productCodes.add(codigo);
    await db.insert(productosTable).values({
      nombre: "Producto captura multipart",
      codigo,
      precioCompra: "100",
      precioVentaSinIva: "200",
      precioVentaConIva: "238",
      stockActual: "0",
      stockMinimo: "0",
    });

    const productoLibro = await workbookBuffer("Productos", [
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
      [codigo, "Producto captura multipart", null, null, null, 100, 200, null],
    ]);
    const productoResponse = await request(apiApp)
      .post("/api/inventario-import")
      .set("X-Operation-Id", idProducto)
      .attach("archivo", productoLibro, "productos.xlsx");
    expect(productoResponse.status).toBe(200);
    expect(productoResponse.body._syncProductos).toHaveLength(1);
    const eventoProducto = await esperarEvento(idProducto);
    expect(eventoProducto.origen).toBe("remoto");
    expect(eventoProducto.estado).toBe("sincronizado");
    expect((eventoProducto.payload as { items: unknown[] }).items).toHaveLength(1);
    expect(eventoProducto.referenciasRespuesta).toEqual([
      {
        campo: "_syncProductos.0.id",
        entidad: "producto",
        valorLocal: String(productoResponse.body._syncProductos[0].id),
      },
    ]);

    const idCliente = operationId();
    const nombre = `Cliente captura multipart ${idCliente}`;
    customerNames.add(nombre);
    const clientesLibro = await workbookBuffer("Clientes", [
      ["NOMBRE", "TELEFONO", "CORREO", "NOTAS"],
      [nombre, null, null, null],
    ]);
    const clienteResponse = await request(apiApp)
      .post("/api/clientes-import")
      .set("X-Operation-Id", idCliente)
      .attach("archivo", clientesLibro, "clientes.xlsx");
    expect(clienteResponse.status).toBe(200);
    expect(clienteResponse.body._syncClientes).toHaveLength(1);
    const eventoCliente = await esperarEvento(idCliente);
    expect(eventoCliente.origen).toBe("remoto");
    expect(eventoCliente.estado).toBe("sincronizado");
    expect((eventoCliente.payload as { items: unknown[] }).items).toHaveLength(1);
    expect(eventoCliente.referenciasRespuesta).toEqual([
      {
        campo: "_syncClientes.0.id",
        entidad: "cliente",
        valorLocal: String(clienteResponse.body._syncClientes[0].id),
      },
    ]);
    await request(apiApp).get("/api/healthz").expect(200);
  });

  it("registra errores de serialización sin fallar la respuesta", async () => {
    const operation = operationId();
    const app = express();
    app.use(express.json());
    app.use(capturarCambiosRemotos);
    app.post("/api/prueba-no-serializable", (req, res) => {
      req.body.circular = req.body;
      res.status(200).json({ ok: true });
    });
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);

    await request(app)
      .post("/api/prueba-no-serializable")
      .set("X-Operation-Id", operation)
      .send({ prueba: true })
      .expect(200, { ok: true });
    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        "No se pudo registrar cambio remoto",
      );
    });
    expect(
      await db
        .select()
        .from(eventosSincronizacionTable)
        .where(eq(eventosSincronizacionTable.operationId, operation)),
    ).toHaveLength(0);
    errorSpy.mockRestore();
  });

  it("sigue capturando el payload JSON cuando no existe un evento previo", async () => {
    const operation = operationId();
    const app = express();
    app.use(express.json());
    app.use(capturarCambiosRemotos);
    app.post("/api/clientes", (_req, res) => res.status(201).json({ ok: true }));
    const body = { nombre: "Cliente JSON capturado", metadata: { fuente: "prueba" } };

    await request(app)
      .post("/api/clientes")
      .set("X-Operation-Id", operation)
      .send(body)
      .expect(201, { ok: true });
    const evento = await esperarEvento(operation);
    expect(evento.payload).toEqual(body);
    expect(evento.origen).toBe("remoto");
    expect(evento.estado).toBe("sincronizado");
  });
});
