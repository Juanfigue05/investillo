import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  abonosCreditosTable,
  creditoLineasTable,
  creditosTable,
  ventasDiariasTable,
} from "@workspace/db/schema";
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";

const router: IRouter = Router();

function toNum(v: unknown): number {
  return typeof v === "string" ? parseFloat(v) : Number(v);
}

/** Abrevia el nombre del cliente: "OTONIEL GARCIA LOPEZ" → "OTONIEL G. L." */
function abreviarNombre(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  if (partes.length <= 1) return nombre.toUpperCase();
  return partes
    .map((p, i) => (i === 0 ? p : p.charAt(0) + "."))
    .join(" ")
    .toUpperCase();
}

type CreditoLineaInput = {
  id?: number | null;
  productoId?: number | null;
  cantidad: number;
  productoNombre: string;
  productoCodigo?: string | null;
  productoMarca?: string | null;
  precioVenta: number;
  precioCompra?: number;
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
    precioCompra: toNum(l.precioCompra ?? "0"),
    valorAbonado,
    valorRestante: Math.max(0, valorTotal - valorAbonado),
  };
}

async function mapCredito(c: typeof creditosTable.$inferSelect) {
  const valorCredito = toNum(c.valorCredito);
  const valorAbonado = toNum(c.valorAbonado);
  const lineas = await db
    .select()
    .from(creditoLineasTable)
    .where(eq(creditoLineasTable.creditoId, c.id));
  const abonos = await db
    .select()
    .from(abonosCreditosTable)
    .where(eq(abonosCreditosTable.creditoId, c.id))
    .orderBy(desc(abonosCreditosTable.fecha));
  return {
    id: c.id,
    tipo: c.tipo ?? "credito",
    concepto: c.concepto ?? null,
    fechaFactura: c.fechaFactura,
    placaVehiculo: c.placaVehiculo,
    nombreCliente: c.nombreCliente,
    telefonoCliente: c.telefonoCliente,
    descripcion: c.descripcion,
    valorCredito,
    valorAbonado,
    valorRestante: Math.max(0, valorCredito - valorAbonado),
    lineas: lineas.map(mapLinea),
    abonos: abonos.map((a) => ({
      id: a.id,
      creditoId: a.creditoId,
      fecha: a.fecha,
      valorTotal: toNum(a.valorTotal),
      notas: a.notas ?? null,
      creadoEn: a.creadoEn,
    })),
    creadoEn: c.creadoEn,
    actualizadoEn: c.actualizadoEn,
  };
}

// GET /creditos?tipo=credito|nosdebe
router.get("/", async (req, res) => {
  const tipo = req.query.tipo as string | undefined;
  const creditos = tipo
    ? await db.select().from(creditosTable).where(eq(creditosTable.tipo, tipo)).orderBy(desc(creditosTable.fechaFactura))
    : await db.select().from(creditosTable).orderBy(desc(creditosTable.fechaFactura));
  res.json(await Promise.all(creditos.map(mapCredito)));
});

// POST /creditos
router.post("/", async (req, res) => {
  const {
    tipo,
    concepto,
    fechaFactura,
    placaVehiculo,
    nombreCliente,
    telefonoCliente,
    descripcion,
    valorCredito,
    valorAbonado,
    lineas = [],
  } = req.body as {
    tipo?: string;
    concepto?: string;
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
    const [created] = await tx
      .insert(creditosTable)
      .values({
        tipo: tipo ?? "credito",
        concepto: concepto || null,
        fechaFactura,
        placaVehiculo: placaVehiculo || null,
        nombreCliente,
        telefonoCliente: telefonoCliente || null,
        descripcion: descripcion || null,
        valorCredito: String(parseFloat(String(valorCredito))),
        valorAbonado: String(parseFloat(String(valorAbonado || 0))),
      })
      .returning();

    if (Array.isArray(lineas) && lineas.length > 0) {
      await tx.insert(creditoLineasTable).values(
        lineas.map((linea) => ({
          creditoId: created.id,
          productoId: linea.productoId || null,
          cantidad: String(parseFloat(String(linea.cantidad))),
          productoNombre: linea.productoNombre,
          productoCodigo: linea.productoCodigo || null,
          productoMarca: linea.productoMarca || null,
          precioVenta: String(parseFloat(String(linea.precioVenta))),
          precioCompra: String(parseFloat(String(linea.precioCompra ?? 0))),
          valorAbonado: String(parseFloat(String(linea.valorAbonado || 0))),
        })),
      );
    }
    return created;
  });

  res.status(201).json(await mapCredito(credito));
});

// PUT /creditos/:id
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const {
    tipo,
    concepto,
    valorAbonado,
    descripcion,
    nombreCliente,
    placaVehiculo,
    telefonoCliente,
    fechaFactura,
    valorCredito,
    lineas,
  } = req.body as {
    tipo?: string;
    concepto?: string | null;
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

  if (tipo !== undefined) updateData.tipo = tipo;
  if (concepto !== undefined) updateData.concepto = concepto;
  if (valorAbonado !== undefined) updateData.valorAbonado = String(parseFloat(String(valorAbonado)));
  if (descripcion !== undefined) updateData.descripcion = descripcion;
  if (nombreCliente !== undefined) updateData.nombreCliente = nombreCliente;
  if (placaVehiculo !== undefined) updateData.placaVehiculo = placaVehiculo;
  if (telefonoCliente !== undefined) updateData.telefonoCliente = telefonoCliente;
  if (fechaFactura !== undefined) updateData.fechaFactura = fechaFactura;
  if (valorCredito !== undefined) updateData.valorCredito = String(parseFloat(String(valorCredito)));

  const [credito] = await db
    .update(creditosTable)
    .set(updateData)
    .where(eq(creditosTable.id, id))
    .returning();

  if (Array.isArray(lineas)) {
    const keepIds = lineas
      .map((linea) => linea.id)
      .filter((lineaId): lineaId is number => typeof lineaId === "number");
    if (keepIds.length > 0) {
      await db
        .delete(creditoLineasTable)
        .where(and(eq(creditoLineasTable.creditoId, id), notInArray(creditoLineasTable.id, keepIds)));
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
        precioCompra: String(parseFloat(String(linea.precioCompra ?? 0))),
        valorAbonado: String(parseFloat(String(linea.valorAbonado || 0))),
      };
      if (linea.id) {
        await db
          .update(creditoLineasTable)
          .set(values)
          .where(and(eq(creditoLineasTable.id, linea.id), eq(creditoLineasTable.creditoId, id)));
      } else {
        await db.insert(creditoLineasTable).values(values);
      }
    }
  }
  res.json(await mapCredito(credito));
});

// POST /creditos/:id/abono — registra el abono y crea filas en ventas_diarias
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
  const creditLines = await db
    .select()
    .from(creditoLineasTable)
    .where(and(eq(creditoLineasTable.creditoId, id), inArray(creditoLineasTable.id, lineIds)));
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

  if (applied.length === 0 || Math.abs(appliedTotal - abonoTotal) > 1) {
    res.status(400).json({ error: "El abono supera el saldo de los productos seleccionados" });
    return;
  }

  const hoy = new Date().toISOString().split("T")[0];
  const nombreAbreviado = abreviarNombre(credito.nombreCliente);
  const conceptoBase = credito.concepto ?? hoy;

  const updated = await db.transaction(async (tx) => {
    // 1. Actualizar valorAbonado de cada línea
    for (const { linea, valor: appliedValue } of applied) {
      await tx
        .update(creditoLineasTable)
        .set({ valorAbonado: String(toNum(linea.valorAbonado) + appliedValue) })
        .where(eq(creditoLineasTable.id, linea.id));
    }

    // 2. Actualizar valorAbonado del crédito
    const newAbonado = toNum(credito.valorAbonado) + appliedTotal;
    const [updatedCredito] = await tx
      .update(creditosTable)
      .set({ valorAbonado: String(newAbonado), actualizadoEn: new Date() })
      .where(eq(creditosTable.id, id))
      .returning();

    // 3. Registrar en historial de abonos
    await tx.insert(abonosCreditosTable).values({
      creditoId: id,
      fecha: hoy,
      valorTotal: String(appliedTotal),
      notas: null,
    });

    // 4. Crear filas en ventas_diarias
    for (const { linea, valor: appliedValue } of applied) {
      const lineaValorTotal = toNum(linea.cantidad) * toNum(linea.precioVenta);
      const lineaValorRestanteAntes = Math.max(0, lineaValorTotal - toNum(linea.valorAbonado));
      const pagaCompleto = Math.abs(appliedValue - lineaValorRestanteAntes) < 1;

      if (pagaCompleto) {
        // Pago completo del producto → fila tipo 'venta' con precios originales del crédito
        const refCompleto = `${conceptoBase} ${nombreAbreviado}`;
        const pvUnidad = toNum(linea.precioVenta); // precio unitario
        const pcUnidad = toNum(linea.precioCompra ?? "0");
        const cant = toNum(linea.cantidad);
        const totalVenta = pvUnidad * cant;
        const beneficio = (pvUnidad - pcUnidad) * cant;
        await tx.insert(ventasDiariasTable).values({
          fecha: hoy,
          referencia: refCompleto,
          tipoLinea: "venta",
          productoId: linea.productoId ?? null,
          productoNombre: linea.productoNombre,
          productoCodigo: linea.productoCodigo ?? null,
          productoMarca: linea.productoMarca ?? null,
          cantidad: String(cant),
          precioCompraUnidad: String(pcUnidad),
          precioVentaUnidad: String(pvUnidad),
          precioVentaTotal: String(totalVenta),
          beneficio: String(beneficio),
          descripcion: `Pago crédito${credito.concepto ? ` ${credito.concepto}` : ""}`,
        });
      } else {
        // Abono parcial → fila tipo 'credito' "Abono A"
        const refAbono = conceptoBase;
        await tx.insert(ventasDiariasTable).values({
          fecha: hoy,
          referencia: refAbono,
          tipoLinea: "credito",
          productoNombre: `Abono A: ${linea.productoNombre}`,
          productoMarca: credito.nombreCliente,
          cantidad: "1",
          precioCompraUnidad: "0",
          precioVentaUnidad: String(appliedValue),
          precioVentaTotal: String(appliedValue),
          beneficio: "0",
          descripcion: `Abono a crédito - ${credito.nombreCliente}`,
        });
      }
    }

    return updatedCredito;
  });

  res.json(await mapCredito(updated));
});

// DELETE /creditos/:id
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(creditoLineasTable).where(eq(creditoLineasTable.creditoId, id));
  await db.delete(abonosCreditosTable).where(eq(abonosCreditosTable.creditoId, id));
  await db.delete(creditosTable).where(eq(creditosTable.id, id));
  res.json({ mensaje: "Credito eliminado" });
});

export default router;
