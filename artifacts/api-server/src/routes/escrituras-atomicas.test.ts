import "../lib/solo-base-de-pruebas";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import request, { type Response } from "supertest";
import { db } from "@workspace/db";
import {
  creditosTable,
  distribucionesTable,
  eventosSincronizacionTable,
  historialDiasTable,
  historialPreciosTable,
  manoObraTable,
  obraElectronicaTable,
  operacionesSincronizadasTable,
  pagosSeguroTable,
  productosTable,
  tensionadasTable,
  trabajadoresTable,
} from "@workspace/db/schema";
import { eq, inArray, sql, sum } from "drizzle-orm";
import app from "../app";

const operationIds = new Set<string>();
const workerNames = new Set<string>();
const manoObraDescriptions = new Set<string>();
const creditIds = new Set<number>();
const obraElectronicaVehicles = new Set<string>();
const historialDates = new Set<string>();
const tensionadaValues = new Set<string>();
const productIds = new Set<number>();
const workerIds = new Set<number>();

function operationId(): string {
  const id = randomUUID();
  operationIds.add(id);
  return id;
}

function marker(prefix: string): string {
  return `ORD13-${prefix}-${randomUUID()}`;
}

async function createWorker(name: string, obraElectronica = false): Promise<number> {
  workerNames.add(name);
  const [worker] = await db.insert(trabajadoresTable).values({
    nombre: name,
    obraElectronica,
  }).returning({ id: trabajadoresTable.id });
  workerIds.add(worker.id);
  return worker.id;
}

async function createProduct(): Promise<number> {
  const code = marker("PRODUCT");
  const [product] = await db.insert(productosTable).values({
    nombre: code,
    codigo: code,
    precioCompra: "100",
    precioVentaSinIva: "200",
    precioVentaConIva: "238",
  }).returning({ id: productosTable.id });
  productIds.add(product.id);
  return product.id;
}

async function nextUniqueHistoryDate(): Promise<string> {
  const rows = await db.select({ fecha: historialDiasTable.fecha }).from(historialDiasTable);
  const existing = new Set(rows.map((row) => row.fecha));
  const start = new Date(Date.UTC(1990, 0, 1));
  for (let offset = 0; offset < 20_000; offset += 1) {
    const candidate = new Date(start.getTime() + offset * 86_400_000)
      .toISOString()
      .slice(0, 10);
    if (!existing.has(candidate)) {
      historialDates.add(candidate);
      return candidate;
    }
  }
  throw new Error("No se encontró una fecha disponible para la prueba de historial");
}

async function createPriceHistory(productId: number): Promise<number> {
  const [history] = await db.insert(historialPreciosTable).values({
    productoId: productId,
    productoNombre: "Producto de prueba",
    precioCompra: "100",
    precioVenta: "200",
    fecha: new Date().toISOString().slice(0, 10),
    origen: "manual",
  }).returning({ id: historialPreciosTable.id });
  return history.id;
}

type FamilyFixture = {
  perform: (operation: string) => Promise<Response>;
  countData: () => Promise<number>;
  assertUnrelatedData?: () => Promise<void>;
  afterSuccess: number;
  afterRollback: number;
};

async function manoObraFixture(): Promise<FamilyFixture> {
  const trabajadorId = await createWorker(marker("WORKER-MO"));
  const descripcion = marker("MANO-OBRA");
  manoObraDescriptions.add(descripcion);
  const body = {
    fecha: "2026-10-30",
    descripcion,
    valorTotal: 125,
    distribuciones: [{
      trabajadorId,
      trabajadorNombre: "Trabajador de prueba",
      valor: 125,
    }],
  };
  return {
    perform: (operation) => request(app).post("/api/manoobra")
      .set("x-operation-id", operation).send(body),
    countData: async () => (await db.select().from(manoObraTable)
      .where(eq(manoObraTable.descripcion, descripcion))).length,
    afterSuccess: 1,
    afterRollback: 0,
  };
}

async function obraElectronicaFixture(): Promise<FamilyFixture> {
  const trabajadorId = await createWorker(marker("WORKER-OE"), true);
  const vehiculo = marker("VEHICLE-OE");
  obraElectronicaVehicles.add(vehiculo);
  const body = {
    trabajadorId,
    fecha: "2026-10-30",
    numeroFactura: marker("INVOICE-OE"),
    vehiculo,
    valor: 10,
  };
  return {
    perform: (operation) => request(app).post("/api/obra-electronica")
      .set("x-operation-id", operation).send(body),
    countData: async () => (await db.select().from(obraElectronicaTable)
      .where(eq(obraElectronicaTable.vehiculo, vehiculo))).length,
    afterSuccess: 1,
    afterRollback: 0,
  };
}

async function tensionadasFixture(): Promise<FamilyFixture> {
  const fecha = "2026-10-30";
  const valor = (100_000 + Math.floor(Math.random() * 800_000)).toFixed(2);
  tensionadaValues.add(valor);
  return {
    perform: (operation) => request(app).post("/api/tensionadas")
      .set("x-operation-id", operation)
      .send({ fecha, valor: Number(valor) }),
    countData: async () => (await db.select().from(tensionadasTable)
      .where(eq(tensionadasTable.valor, valor))).length,
    afterSuccess: 1,
    afterRollback: 0,
  };
}

async function historialFixture(): Promise<FamilyFixture> {
  const fecha = await nextUniqueHistoryDate();
  const notas = marker("HISTORIAL");
  return {
    perform: (operation) => request(app).post("/api/historial")
      .set("x-operation-id", operation).send({ fecha, notas }),
    countData: async () => (await db.select().from(historialDiasTable)
      .where(eq(historialDiasTable.fecha, fecha))).length,
    afterSuccess: 1,
    afterRollback: 0,
  };
}

async function historialPreciosFixture(): Promise<FamilyFixture> {
  const productId = await createProduct();
  const otroProductoId = await createProduct();
  await createPriceHistory(productId);
  await createPriceHistory(productId);
  await createPriceHistory(otroProductoId);
  return {
    perform: (operation) => request(app)
      .delete(`/api/historial-precios/producto/${productId}`)
      .set("x-operation-id", operation),
    countData: async () => (await db.select().from(historialPreciosTable)
      .where(eq(historialPreciosTable.productoId, productId))).length,
    assertUnrelatedData: async () => {
      expect(await db.select().from(historialPreciosTable)
        .where(eq(historialPreciosTable.productoId, otroProductoId))).toHaveLength(1);
    },
    afterSuccess: 0,
    afterRollback: 2,
  };
}

async function trabajadoresFixture(): Promise<FamilyFixture> {
  const nombre = marker("TRABAJADOR");
  workerNames.add(nombre);
  return {
    perform: (operation) => request(app).post("/api/trabajadores")
      .set("x-operation-id", operation).send({ nombre }),
    countData: async () => (await db.select().from(trabajadoresTable)
      .where(eq(trabajadoresTable.nombre, nombre))).length,
    afterSuccess: 1,
    afterRollback: 0,
  };
}

const routeFamilies = [
  { name: "manoobra", createFixture: manoObraFixture },
  { name: "obra-electronica", createFixture: obraElectronicaFixture },
  { name: "tensionadas", createFixture: tensionadasFixture },
  { name: "historial", createFixture: historialFixture },
  { name: "historial-precios", createFixture: historialPreciosFixture },
  { name: "trabajadores", createFixture: trabajadoresFixture },
];

type AdditionalFixture = {
  name: string;
  prepare: () => Promise<FamilyFixture>;
};

const additionalMutationFixtures: AdditionalFixture[] = [
  {
    name: "manoobra PUT",
    prepare: async () => {
      const trabajadorId = await createWorker(marker("WORKER-MO-PUT"));
      const descripcion = marker("MANO-OBRA-PUT");
      manoObraDescriptions.add(descripcion);
      const [labor] = await db.insert(manoObraTable).values({
        fecha: "2026-10-30",
        descripcion,
        valorTotal: "10",
      }).returning({ id: manoObraTable.id });
      await db.insert(distribucionesTable).values({
        manoObraId: labor.id,
        trabajadorId,
        trabajadorNombre: "Trabajador de prueba",
        valor: "10",
      });
      await db.update(trabajadoresTable)
        .set({ totalGanado: "10" })
        .where(eq(trabajadoresTable.id, trabajadorId));
      return {
        perform: (operation) => request(app).put(`/api/manoobra/${labor.id}`)
          .set("x-operation-id", operation)
          .send({
            fecha: "2026-10-30",
            descripcion,
            valorTotal: 12,
            distribuciones: [{
              trabajadorId,
              trabajadorNombre: "Trabajador de prueba",
              valor: 12,
            }],
          }),
        countData: async () => (await db.select().from(manoObraTable)
          .where(eq(manoObraTable.descripcion, descripcion)))[0]?.valorTotal === "10.00" ? 1 : 0,
        afterSuccess: 0,
        afterRollback: 1,
      };
    },
  },
  {
    name: "manoobra DELETE",
    prepare: async () => {
      const trabajadorId = await createWorker(marker("WORKER-MO-DELETE"));
      const descripcion = marker("MANO-OBRA-DELETE");
      manoObraDescriptions.add(descripcion);
      const [labor] = await db.insert(manoObraTable).values({
        fecha: "2026-10-30",
        descripcion,
        valorTotal: "10",
      }).returning({ id: manoObraTable.id });
      await db.insert(distribucionesTable).values({
        manoObraId: labor.id,
        trabajadorId,
        trabajadorNombre: "Trabajador de prueba",
        valor: "10",
      });
      await db.update(trabajadoresTable)
        .set({ totalGanado: "10" })
        .where(eq(trabajadoresTable.id, trabajadorId));
      return {
        perform: (operation) => request(app).delete(`/api/manoobra/${labor.id}`)
          .set("x-operation-id", operation),
        countData: async () => (await db.select().from(manoObraTable)
          .where(eq(manoObraTable.descripcion, descripcion))).length,
        afterSuccess: 0,
        afterRollback: 1,
      };
    },
  },
  {
    name: "obra-electronica PUT",
    prepare: async () => {
      const trabajadorId = await createWorker(marker("WORKER-OE-PUT"), true);
      const vehiculo = marker("VEHICLE-OE-PUT");
      const nuevoVehiculo = marker("VEHICLE-OE-PUT-UPDATED");
      obraElectronicaVehicles.add(vehiculo);
      obraElectronicaVehicles.add(nuevoVehiculo);
      const [record] = await db.insert(obraElectronicaTable).values({
        trabajadorId,
        empleadoNombre: marker("EMPLOYEE-OE-PUT"),
        fecha: "2026-10-30",
        numeroFactura: marker("INVOICE-OE-PUT"),
        vehiculo,
        valor: "10",
      }).returning({ id: obraElectronicaTable.id });
      return {
        perform: (operation) => request(app).put(`/api/obra-electronica/${record.id}`)
          .set("x-operation-id", operation)
          .send({
            fecha: "2026-10-31",
            numeroFactura: marker("INVOICE-OE-UPDATED"),
            vehiculo: nuevoVehiculo,
            valor: 12,
          }),
        countData: async () => (await db.select().from(obraElectronicaTable)
          .where(eq(obraElectronicaTable.vehiculo, vehiculo))).length,
        afterSuccess: 0,
        afterRollback: 1,
      };
    },
  },
  {
    name: "obra-electronica DELETE",
    prepare: async () => {
      const trabajadorId = await createWorker(marker("WORKER-OE-DELETE"), true);
      const vehiculo = marker("VEHICLE-OE-DELETE");
      obraElectronicaVehicles.add(vehiculo);
      const [record] = await db.insert(obraElectronicaTable).values({
        trabajadorId,
        empleadoNombre: marker("EMPLOYEE-OE-DELETE"),
        fecha: "2026-10-30",
        numeroFactura: marker("INVOICE-OE-DELETE"),
        vehiculo,
        valor: "10",
      }).returning({ id: obraElectronicaTable.id });
      return {
        perform: (operation) => request(app).delete(`/api/obra-electronica/${record.id}`)
          .set("x-operation-id", operation),
        countData: async () => (await db.select().from(obraElectronicaTable)
          .where(eq(obraElectronicaTable.vehiculo, vehiculo))).length,
        afterSuccess: 0,
        afterRollback: 1,
      };
    },
  },
  {
    name: "tensionadas PATCH",
    prepare: async () => {
      const fecha = "2026-10-30";
      const valorAnterior = (800_000 + Math.floor(Math.random() * 90_000)).toFixed(2);
      const nuevoValor = (900_000 + Math.floor(Math.random() * 90_000)).toFixed(2);
      tensionadaValues.add(valorAnterior);
      tensionadaValues.add(nuevoValor);
      const [record] = await db.insert(tensionadasTable).values({
        fecha,
        valor: valorAnterior,
      }).returning({ id: tensionadasTable.id });
      return {
        perform: (operation) => request(app).patch(`/api/tensionadas/${record.id}`)
          .set("x-operation-id", operation)
          .send({ fecha, valor: Number(nuevoValor) }),
        countData: async () => (await db.select().from(tensionadasTable)
          .where(eq(tensionadasTable.id, record.id)))[0]?.valor === valorAnterior ? 1 : 0,
        afterSuccess: 0,
        afterRollback: 1,
      };
    },
  },
  {
    name: "tensionadas DELETE",
    prepare: async () => {
      const fecha = "2026-10-30";
      const valor = (900_000 + Math.floor(Math.random() * 90_000)).toFixed(2);
      tensionadaValues.add(valor);
      const [record] = await db.insert(tensionadasTable).values({
        fecha,
        valor,
      }).returning({ id: tensionadasTable.id });
      return {
        perform: (operation) => request(app).delete(`/api/tensionadas/${record.id}`)
          .set("x-operation-id", operation),
        countData: async () => (await db.select().from(tensionadasTable)
          .where(eq(tensionadasTable.valor, valor))).length,
        afterSuccess: 0,
        afterRollback: 1,
      };
    },
  },
  {
    name: "historial PUT",
    prepare: async () => {
      const fecha = await nextUniqueHistoryDate();
      const notas = marker("HISTORIAL-PUT-OLD");
      const [record] = await db.insert(historialDiasTable).values({ fecha, notas })
        .returning({ id: historialDiasTable.id });
      return {
        perform: (operation) => request(app).put(`/api/historial/${record.id}`)
          .set("x-operation-id", operation)
          .send({ notas: marker("HISTORIAL-PUT-NEW") }),
        countData: async () => (await db.select().from(historialDiasTable)
          .where(eq(historialDiasTable.id, record.id)))[0]?.notas === notas ? 1 : 0,
        afterSuccess: 0,
        afterRollback: 1,
      };
    },
  },
  {
    name: "historial DELETE",
    prepare: async () => {
      const fecha = await nextUniqueHistoryDate();
      const [record] = await db.insert(historialDiasTable).values({
        fecha,
        notas: marker("HISTORIAL-DELETE"),
      }).returning({ id: historialDiasTable.id });
      return {
        perform: (operation) => request(app).delete(`/api/historial/${record.id}`)
          .set("x-operation-id", operation),
        countData: async () => (await db.select().from(historialDiasTable)
          .where(eq(historialDiasTable.id, record.id))).length,
        afterSuccess: 0,
        afterRollback: 1,
      };
    },
  },
  {
    name: "historial-precios DELETE by id",
    prepare: async () => {
      const productId = await createProduct();
      const priceId = await createPriceHistory(productId);
      return {
        perform: (operation) => request(app).delete(`/api/historial-precios/${priceId}`)
          .set("x-operation-id", operation),
        countData: async () => (await db.select().from(historialPreciosTable)
          .where(eq(historialPreciosTable.id, priceId))).length,
        afterSuccess: 0,
        afterRollback: 1,
      };
    },
  },
  {
    name: "trabajadores PUT",
    prepare: async () => {
      const nombre = marker("WORKER-PUT-OLD");
      const nuevoNombre = marker("WORKER-PUT-NEW");
      const trabajadorId = await createWorker(nombre);
      return {
        perform: (operation) => request(app).put(`/api/trabajadores/${trabajadorId}`)
          .set("x-operation-id", operation)
          .send({ nombre: nuevoNombre }),
        countData: async () => (await db.select().from(trabajadoresTable)
          .where(eq(trabajadoresTable.id, trabajadorId)))[0]?.nombre === nombre ? 1 : 0,
        afterSuccess: 0,
        afterRollback: 1,
      };
    },
  },
  {
    name: "trabajadores POST pagos-seguro",
    prepare: async () => {
      const trabajadorId = await createWorker(marker("WORKER-INSURANCE-POST"));
      const fecha = "2026-10-30";
      const monto = "37.25";
      return {
        perform: (operation) => request(app)
          .post(`/api/trabajadores/${trabajadorId}/pagos-seguro`)
          .set("x-operation-id", operation)
          .send({ fecha, monto: Number(monto) }),
        countData: async () => (await db.select().from(pagosSeguroTable)
          .where(eq(pagosSeguroTable.trabajadorId, trabajadorId)))
          .filter((pago) => pago.fecha === fecha && pago.monto === monto).length,
        afterSuccess: 1,
        afterRollback: 0,
      };
    },
  },
  {
    name: "trabajadores DELETE pagos-seguro",
    prepare: async () => {
      const trabajadorId = await createWorker(marker("WORKER-INSURANCE-DELETE"));
      const [payment] = await db.insert(pagosSeguroTable).values({
        trabajadorId,
        fecha: "2026-10-30",
        monto: "37.25",
      }).returning({ id: pagosSeguroTable.id });
      return {
        perform: (operation) => request(app)
          .delete(`/api/trabajadores/${trabajadorId}/pagos-seguro/${payment.id}`)
          .set("x-operation-id", operation),
        countData: async () => (await db.select().from(pagosSeguroTable)
          .where(eq(pagosSeguroTable.id, payment.id))).length,
        afterSuccess: 0,
        afterRollback: 1,
      };
    },
  },
];

async function countEvents(operation: string): Promise<number> {
  return (await db.select().from(eventosSincronizacionTable)
    .where(eq(eventosSincronizacionTable.operationId, operation))).length;
}

async function countOperations(operation: string): Promise<number> {
  return (await db.select().from(operacionesSincronizadasTable)
    .where(eq(operacionesSincronizadasTable.operationId, operation))).length;
}

async function expectOneRecordedOperation(operation: string): Promise<void> {
  expect(await countEvents(operation)).toBe(1);
  expect(await countOperations(operation)).toBe(1);
}

async function enableEventInsertFailure(): Promise<void> {
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION orden13_fallar_evento() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'Fallo inducido por prueba Orden 13';
    END;
    $$ LANGUAGE plpgsql
  `);
  await db.execute(sql`
    CREATE TRIGGER orden13_fallar_evento_trigger
    BEFORE INSERT ON eventos_sincronizacion
    FOR EACH ROW EXECUTE FUNCTION orden13_fallar_evento()
  `);
}

async function disableEventInsertFailure(): Promise<void> {
  await db.execute(sql`
    DROP TRIGGER IF EXISTS orden13_fallar_evento_trigger
    ON eventos_sincronizacion
  `);
  await db.execute(sql`DROP FUNCTION IF EXISTS orden13_fallar_evento()`);
}

afterEach(async () => {
  await disableEventInsertFailure();
  const operations = [...operationIds];
  const names = [...workerNames];
  const descriptions = [...manoObraDescriptions];
  const credits = [...creditIds];
  const vehicles = [...obraElectronicaVehicles];
  const dates = [...historialDates];
  const values = [...tensionadaValues];
  const products = [...productIds];
  const workers = [...workerIds];
  operationIds.clear();
  workerNames.clear();
  manoObraDescriptions.clear();
  creditIds.clear();
  obraElectronicaVehicles.clear();
  historialDates.clear();
  tensionadaValues.clear();
  productIds.clear();
  workerIds.clear();

  if (operations.length) {
    await db.delete(eventosSincronizacionTable).where(
      inArray(eventosSincronizacionTable.operationId, operations),
    );
    await db.delete(operacionesSincronizadasTable).where(
      inArray(operacionesSincronizadasTable.operationId, operations),
    );
  }
  if (descriptions.length) {
    const labor = await db.select({ id: manoObraTable.id }).from(manoObraTable)
      .where(inArray(manoObraTable.descripcion, descriptions));
    const laborIds = labor.map((row) => row.id);
    if (laborIds.length) {
      await db.delete(distribucionesTable).where(
        inArray(distribucionesTable.manoObraId, laborIds),
      );
      await db.delete(manoObraTable).where(inArray(manoObraTable.id, laborIds));
    }
    if (credits.length) {
      await db.delete(creditosTable).where(inArray(creditosTable.id, credits));
    }
  }
  if (workers.length) {
    await db.delete(distribucionesTable).where(
      inArray(distribucionesTable.trabajadorId, workers),
    );
    await db.delete(pagosSeguroTable).where(
      inArray(pagosSeguroTable.trabajadorId, workers),
    );
  }
  if (vehicles.length) {
    await db.delete(obraElectronicaTable).where(
      inArray(obraElectronicaTable.vehiculo, vehicles),
    );
  }
  if (dates.length) {
    await db.delete(historialDiasTable).where(inArray(historialDiasTable.fecha, dates));
  }
  if (values.length) {
    await db.delete(tensionadasTable).where(inArray(tensionadasTable.valor, values));
  }
  if (products.length) {
    await db.delete(historialPreciosTable).where(
      inArray(historialPreciosTable.productoId, products),
    );
    await db.delete(productosTable).where(inArray(productosTable.id, products));
  }
  if (names.length) {
    await db.delete(obraElectronicaTable).where(
      inArray(obraElectronicaTable.empleadoNombre, names),
    );
    await db.delete(trabajadoresTable).where(inArray(trabajadoresTable.nombre, names));
  }
  if (workers.length) {
    await db.delete(trabajadoresTable).where(inArray(trabajadoresTable.id, workers));
  }
});

describe.each(routeFamilies)("$name transactional idempotency", ({ createFixture }) => {
  it("does not repeat data or event for a sequential duplicate operation", async () => {
    const fixture = await createFixture();
    const operation = operationId();

    const first = await fixture.perform(operation);
    const duplicate = await fixture.perform(operation);

    expect(first.status).toBeGreaterThanOrEqual(200);
    expect(first.status).toBeLessThan(300);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body).toMatchObject({ ok: true, yaProcesado: true });
    expect(await fixture.countData()).toBe(fixture.afterSuccess);
    await fixture.assertUnrelatedData?.();
    await expectOneRecordedOperation(operation);
  });

  it("serializes concurrent requests with the same operation ID", async () => {
    const fixture = await createFixture();
    const operation = operationId();

    const responses = await Promise.all([
      fixture.perform(operation),
      fixture.perform(operation),
    ]);

    expect(responses.every((response) => response.status >= 200 && response.status < 300)).toBe(true);
    expect(responses.filter((response) => response.body.yaProcesado === true)).toHaveLength(1);
    expect(await fixture.countData()).toBe(fixture.afterSuccess);
    await fixture.assertUnrelatedData?.();
    await expectOneRecordedOperation(operation);
  });

  it("rolls back data when inserting the synchronization event fails", async () => {
    const fixture = await createFixture();
    const operation = operationId();
    await enableEventInsertFailure();
    let response: Response;
    try {
      response = await fixture.perform(operation);
    } finally {
      await disableEventInsertFailure();
    }

    expect(response!.status).toBeGreaterThanOrEqual(400);
    expect(await fixture.countData()).toBe(fixture.afterRollback);
    await fixture.assertUnrelatedData?.();
    expect(await countEvents(operation)).toBe(0);
    expect(await countOperations(operation)).toBe(0);
  });
});

describe.each(additionalMutationFixtures)("$name transactional idempotency", ({ prepare }) => {
  it("does not repeat data or event for a sequential duplicate operation", async () => {
    const fixture = await prepare();
    const operation = operationId();

    const first = await fixture.perform(operation);
    const duplicate = await fixture.perform(operation);

    expect(first.status).toBeGreaterThanOrEqual(200);
    expect(first.status).toBeLessThan(300);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body).toMatchObject({ ok: true, yaProcesado: true });
    expect(await fixture.countData()).toBe(fixture.afterSuccess);
    await fixture.assertUnrelatedData?.();
    await expectOneRecordedOperation(operation);
  });

  it("serializes concurrent requests with the same operation ID", async () => {
    const fixture = await prepare();
    const operation = operationId();

    const responses = await Promise.all([
      fixture.perform(operation),
      fixture.perform(operation),
    ]);

    expect(responses.every((response) => response.status >= 200 && response.status < 300)).toBe(true);
    expect(responses.filter((response) => response.body.yaProcesado === true)).toHaveLength(1);
    expect(await fixture.countData()).toBe(fixture.afterSuccess);
    await fixture.assertUnrelatedData?.();
    await expectOneRecordedOperation(operation);
  });

  it("rolls back data when inserting the synchronization event fails", async () => {
    const fixture = await prepare();
    const operation = operationId();
    await enableEventInsertFailure();
    let response: Response;
    try {
      response = await fixture.perform(operation);
    } finally {
      await disableEventInsertFailure();
    }

    expect(response!.status).toBeGreaterThanOrEqual(400);
    expect(await fixture.countData()).toBe(fixture.afterRollback);
    await fixture.assertUnrelatedData?.();
    expect(await countEvents(operation)).toBe(0);
    expect(await countOperations(operation)).toBe(0);
  });
});

async function expectWorkerTotalsMatchDistributions(ids: number[]): Promise<void> {
  for (const id of ids) {
    const [worker] = await db.select({
      totalGanado: trabajadoresTable.totalGanado,
    }).from(trabajadoresTable).where(eq(trabajadoresTable.id, id));
    const [result] = await db.select({
      total: sum(distribucionesTable.valor),
    }).from(distribucionesTable)
      .where(eq(distribucionesTable.trabajadorId, id));
    expect(Number(worker.totalGanado)).toBeCloseTo(Number(result.total ?? 0), 2);
  }
}

describe("manoobra worker totals", () => {
  it("preserves the 409 when labor belongs to a credit", async () => {
    const [credit] = await db.insert(creditosTable).values({
      tipo: "credito",
      concepto: marker("CREDIT"),
      fechaFactura: "2026-10-30",
      nombreCliente: "Cliente de prueba",
      valorCredito: "100",
    }).returning({ id: creditosTable.id });
    creditIds.add(credit.id);
    const [labor] = await db.insert(manoObraTable).values({
      fecha: "2026-10-30",
      descripcion: marker("CREDIT-LABOR"),
      valorTotal: "100",
      creditoId: credit.id,
    }).returning({ id: manoObraTable.id });
    manoObraDescriptions.add((await db.select({ descripcion: manoObraTable.descripcion })
      .from(manoObraTable).where(eq(manoObraTable.id, labor.id)))[0]!.descripcion);

    const update = await request(app)
      .put(`/api/manoobra/${labor.id}`)
      .set("x-operation-id", operationId())
      .send({ fecha: "2026-10-30", descripcion: "Cambio", valorTotal: 50 });
    const remove = await request(app)
      .delete(`/api/manoobra/${labor.id}`)
      .set("x-operation-id", operationId());

    expect(update.status).toBe(409);
    expect(remove.status).toBe(409);
  });

  it("keeps totalGanado equal to distributions across POST, replacement PUT, and DELETE", async () => {
    const workerOne = await createWorker(marker("WORKER-GOLD-A"));
    const workerTwo = await createWorker(marker("WORKER-GOLD-B"));
    const workerThree = await createWorker(marker("WORKER-GOLD-C"));
    const description = marker("GOLDEN-RULE");
    manoObraDescriptions.add(description);
    const createResponse = await request(app)
      .post("/api/manoobra")
      .set("x-operation-id", operationId())
      .send({
        fecha: "2026-10-30",
        descripcion: description,
        valorTotal: 80,
        distribuciones: [
          { trabajadorId: workerOne, trabajadorNombre: "Uno", valor: 35 },
          { trabajadorId: workerTwo, trabajadorNombre: "Dos", valor: 45 },
        ],
      });
    expect(createResponse.status).toBe(201);
    const manoObraId = createResponse.body.id as number;
    await expectWorkerTotalsMatchDistributions([workerOne, workerTwo, workerThree]);

    const updateResponse = await request(app)
      .put(`/api/manoobra/${manoObraId}`)
      .set("x-operation-id", operationId())
      .send({
        fecha: "2026-10-30",
        descripcion: description,
        valorTotal: 70,
        distribuciones: [
          { trabajadorId: workerThree, trabajadorNombre: "Tres", valor: 25 },
          { trabajadorId: workerOne, trabajadorNombre: "Uno", valor: 45 },
        ],
      });
    expect(updateResponse.status).toBe(200);
    await expectWorkerTotalsMatchDistributions([workerOne, workerTwo, workerThree]);

    const deleteResponse = await request(app)
      .delete(`/api/manoobra/${manoObraId}`)
      .set("x-operation-id", operationId());
    expect(deleteResponse.status).toBe(200);
    await expectWorkerTotalsMatchDistributions([workerOne, workerTwo, workerThree]);
    expect(await db.select().from(distribucionesTable)
      .where(eq(distribucionesTable.manoObraId, manoObraId))).toHaveLength(0);
  });
});
