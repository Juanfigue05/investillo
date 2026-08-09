import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { creditoLineasTable, creditosTable, ventasDiariasTable } from "@workspace/db/schema";
import { and, eq, inArray, notInArray } from "drizzle-orm";

const router: IRouter = Router();

function toNum(v: unknown): number {
  return typeof v === "string" ? parseFloat(v) : Number(v);
}

type CreditoLineaInput = {
  id?: number | null;
  productoId?: number | null;
  cantidad: number;
  productoNombre: string;
  productoCodigo?: string | null;
  productoMarca?: string | null;
  precioVenta: number;
  valorAbonado?: number;
};

function mapLinea(l: typeof creditoLineasTable.$inferSelect) {
  const valorTotal = toNum(l.cantidad) * toNum(l.precioVenta);
  const valorAbonado = toNum(l.valorAbonado);
  return {
    id: l.id,
    productoId: l.productoId,
    cantidad: toNum(l.cantidad),
    productoNombre: l.productoNombre,
    productoCodigo: l.productoCodigo,
    productoMarca: l.productoMarca,
    precioVenta: toNum(l.precioVenta),
    valorAbonado,
    valorRestante: Math.max(0, valorTotal - valorAbonado),
  };
}

async function mapCredito(c: typeof creditosTable.$inferSelect) {
  const valorCredito = toNum(c.valorCredito);
  const valorAbonado = toNum(c.valorAbonado);
  const lineas = await db.select().from(creditoLineasTable).where(eq(creditoLineasTable.creditoId, c.id));
  return {
    id: c.id,
    fechaFactura: c.fechaFactura,
    placaVehiculo: c.placaVehiculo,
    nombreCliente: c.nombreCliente,
    telefonoCliente: c.telefonoCliente,
    descripcion: c.descripcion,
    valorCredito,
    valorAbonado,
    valorRestante: Math.max(0, valorCredito - valorAbonado),
    lineas: lineas.map(mapLinea),
    creadoEn: c.creadoEn,
    actualizadoEn: c.actualizadoEn,
  };
}

router.get("/", async (req, res) => {
  const creditos = await db.select().from(creditosTable).orderBy(creditosTable.creadoEn);
  res.json(await Promise.all(creditos.map(mapCredito)));
});

router.post("/", async (req, res) => {
  const { fechaFactura, placaVehiculo, nombreCliente, telefonoCliente, descripcion, valorCredito, valorAbonado, lineas = [] } = req.body as {
    fechaFactura: string;
    placaVehiculo?: string;
    nombreCliente: string;
    telefonoCliente?: string;
    descripcion?: string;
    valorCredito: number;
    valorAbonado?: number;
    lineas: CreditoLineaInput[];
  };

  const credito = await db.transaction(async (tx) => {
    const [created] = await tx.insert(creditosTable).values({
      fechaFactura,
      placaVehiculo: placaVehiculo || null,
      nombreCliente,
      telefonoCliente: telefonoCliente || null,
      descripcion: descripcion || null,
      valorCredito: String(parseFloat(String(valorCredito))),
      valorAbonado: String(parseFloat(String(valorAbonado || 0))),
    }).returning();

    if (Array.isArray(lineas) && lineas.length > 0) {
      await tx.insert(creditoLineasTable).values(lineas.map((linea) => ({
        creditoId: created.id,
        productoId: linea.productoId || null,
        cantidad: String(parseFloat(String(linea.cantidad))),
        productoNombre: linea.productoNombre,
        productoCodigo: linea.productoCodigo || null,
        productoMarca: linea.productoMarca || null,
        precioVenta: String(parseFloat(String(linea.precioVenta))),
        valorAbonado: String(parseFloat(String(linea.valorAbonado || 0))),
      })));
    }
    return created;
  });

  res.status(201).json(await mapCredito(credito));
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { valorAbonado, descripcion, nombreCliente, placaVehiculo, telefonoCliente, fechaFactura, valorCredito, lineas } = req.body as {
    valorAbonado?: number;
    descripcion?: string | null;
    nombreCliente?: string;
    placaVehiculo?: string | null;
    telefonoCliente?: string | null;
    fechaFactura?: string;
    valorCredito?: number;
    lineas?: CreditoLineaInput[];
  };

  const [existing] = await db.select().from(creditosTable).where(eq(creditosTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Credito no encontrado" });
    return;
  }

  const updateData: Partial<typeof creditosTable.$inferInsert> = {
    actualizadoEn: new Date(),
  };

  if (valorAbonado !== undefined) updateData.valorAbonado = String(parseFloat(String(valorAbonado)));
  if (descripcion !== undefined) updateData.descripcion = descripcion;
  if (nombreCliente !== undefined) updateData.nombreCliente = nombreCliente;
  if (placaVehiculo !== undefined) updateData.placaVehiculo = placaVehiculo;
  if (telefonoCliente !== undefined) updateData.telefonoCliente = telefonoCliente;
  if (fechaFactura !== undefined) updateData.fechaFactura = fechaFactura;
  if (valorCredito !== undefined) updateData.valorCredito = String(parseFloat(String(valorCredito)));

  const [credito] = await db.update(creditosTable).set(updateData).where(eq(creditosTable.id, id)).returning();
  if (Array.isArray(lineas)) {
    const keepIds = lineas.map((linea) => linea.id).filter((lineaId): lineaId is number => typeof lineaId === "number");
    if (keepIds.length > 0) {
      await db.delete(creditoLineasTable).where(and(eq(creditoLineasTable.creditoId, id), notInArray(creditoLineasTable.id, keepIds)));
    } else {
      await db.delete(creditoLineasTable).where(eq(creditoLineasTable.creditoId, id));
    }
    for (const linea of lineas) {
      const values = {
        creditoId: id,
        productoId: linea.productoId || null,
        cantidad: String(parseFloat(String(linea.cantidad))),
        productoNombre: linea.productoNombre,
        productoCodigo: linea.productoCodigo || null,
        productoMarca: linea.productoMarca || null,
        precioVenta: String(parseFloat(String(linea.precioVenta))),
        valorAbonado: String(parseFloat(String(linea.valorAbonado || 0))),
      };
      if (linea.id) {
        await db.update(creditoLineasTable).set(values).where(and(eq(creditoLineasTable.id, linea.id), eq(creditoLineasTable.creditoId, id)));
      } else {
        await db.insert(creditoLineasTable).values(values);
      }
    }
  }
  res.json(await mapCredito(credito));
});

router.post("/:id/abono", async (req, res) => {
  const id = parseInt(req.params.id);
  const { valor, lineas } = req.body as { valor: number; lineas: { lineaId: number; valor: number }[] };
  const abonoTotal = parseFloat(String(valor));

  if (!Number.isFinite(abonoTotal) || abonoTotal <= 0 || !Array.isArray(lineas) || lineas.length === 0) {
    res.status(400).json({ error: "Selecciona al menos un producto y un valor válido" });
    return;
  }

  const [credito] = await db.select().from(creditosTable).where(eq(creditosTable.id, id));
  if (!credito) {
    res.status(404).json({ error: "Credito no encontrado" });
    return;
  }

  const lineIds = lineas.map((linea) => linea.lineaId);
  const creditLines = await db.select().from(creditoLineasTable).where(
    and(eq(creditoLineasTable.creditoId, id), inArray(creditoLineasTable.id, lineIds)),
  );
  const byId = new Map(creditLines.map((linea) => [linea.id, linea]));
  let appliedTotal = 0;
  const applied: Array<{ linea: typeof creditoLineasTable.$inferSelect; valor: number }> = [];

  for (const requested of lineas) {
    const linea = byId.get(requested.lineaId);
    if (!linea) continue;
    const requestedValue = parseFloat(String(requested.valor));
    const remaining = Math.max(0, toNum(linea.cantidad) * toNum(linea.precioVenta) - toNum(linea.valorAbonado));
    const appliedValue = Math.min(requestedValue, remaining);
    if (appliedValue > 0) {
      appliedTotal += appliedValue;
      applied.push({ linea, valor: appliedValue });
    }
  }

  if (applied.length === 0 || Math.abs(appliedTotal - abonoTotal) > 0.01) {
    res.status(400).json({ error: "El abono supera el saldo de los productos seleccionados" });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    for (const { linea, valor: appliedValue } of applied) {
      await tx.update(creditoLineasTable)
        .set({ valorAbonado: String(toNum(linea.valorAbonado) + appliedValue) })
        .where(eq(creditoLineasTable.id, linea.id));
    }

    // One simple "Abono A" row per payment, not one per product
    await tx.insert(ventasDiariasTable).values({
      fecha: new Date().toISOString().split("T")[0],
      referencia: credito.nombreCliente,
      tipoLinea: "credito",
      productoNombre: `Abono A ${credito.nombreCliente}`,
      cantidad: "1",
      precioCompraUnidad: "0",
      precioVentaUnidad: String(appliedTotal),
      precioVentaTotal: String(appliedTotal),
      beneficio: "0",
      descripcion: `Abono de crédito — ${credito.nombreCliente}`,
    });

    const newAbonado = toNum(credito.valorAbonado) + appliedTotal;
    const [updatedCredito] = await tx.update(creditosTable)
      .set({ valorAbonado: String(newAbonado), actualizadoEn: new Date() })
      .where(eq(creditosTable.id, id))
      .returning();
    return updatedCredito;
  });

  res.json(await mapCredito(updated));
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(creditosTable).where(eq(creditosTable.id, id));
  res.json({ mensaje: "Credito eliminado" });
});

export default router;
