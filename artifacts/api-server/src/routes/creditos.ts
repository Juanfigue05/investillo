import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  abonosCreditosTable,
  creditoLineasTable,
  creditosTable,
  distribucionesTable,
  manoObraTable,
  trabajadoresTable,
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

type CreditoManoObraInput = {
  valor: number;
  trabajadores?: { id: number; nombre: string }[];
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function ajustarTotalGanado(tx: Tx, trabajadorId: number, delta: number) {
  const [trab] = await tx.select().from(trabajadoresTable).where(eq(trabajadoresTable.id, trabajadorId));
  if (trab) {
    await tx
      .update(trabajadoresTable)
      .set({ totalGanado: String(toNum(trab.totalGanado) + delta) })
      .where(eq(trabajadoresTable.id, trabajadorId));
  }
}

/**
 * Sincroniza (crea/actualiza/elimina) el registro de mano de obra vinculado a un crédito,
 * ajustando el totalGanado de los trabajadores de forma atómica.
 */
async function syncManoObraCredito(
  tx: Tx,
  credito: typeof creditosTable.$inferSelect,
  input: CreditoManoObraInput | null | undefined,
) {
  const [existing] = await tx.select().from(manoObraTable).where(eq(manoObraTable.creditoId, credito.id));

  // Revertir distribuciones existentes (resta totalGanado y borra las filas)
  const revertir = async (moId: number) => {
    const dists = await tx.select().from(distribucionesTable).where(eq(distribucionesTable.manoObraId, moId));
    for (const d of dists) {
      await ajustarTotalGanado(tx, d.trabajadorId, -toNum(d.valor));
    }
    await tx.delete(distribucionesTable).where(eq(distribucionesTable.manoObraId, moId));
    return dists;
  };

  const valor = input ? toNum(input.valor) : 0;

  if (!input || !Number.isFinite(valor) || valor <= 0) {
    // Eliminar mano de obra existente
    if (existing) {
      await revertir(existing.id);
      await tx.delete(manoObraTable).where(eq(manoObraTable.id, existing.id));
    }
    return;
  }

  // Construir nuevas distribuciones
  let nuevas: { trabajadorId: number; trabajadorNombre: string; valor: number }[] = [];
  if (input.trabajadores && input.trabajadores.length > 0) {
    // Validar y deduplicar trabajadores; resolver nombres desde la BD (no confiar en el request)
    const ids = [...new Set(input.trabajadores.map((t) => Number(t.id)))];
    const registros = await tx.select().from(trabajadoresTable).where(inArray(trabajadoresTable.id, ids));
    if (registros.length !== ids.length) {
      throw new Error("Uno o más trabajadores seleccionados no existen");
    }
    const n = registros.length;
    const base = Math.floor(valor / n);
    const resto = valor - base * n;
    nuevas = registros.map((t, i) => ({
      trabajadorId: t.id,
      trabajadorNombre: t.nombre,
      valor: i === n - 1 ? base + resto : base,
    }));
    if (existing) await revertir(existing.id);
  } else if (existing) {
    // Sin trabajadores explícitos → reescalar las distribuciones existentes al nuevo valor
    const prev = await revertir(existing.id);
    const prevTotal = prev.reduce((s, d) => s + toNum(d.valor), 0);
    if (prevTotal > 0) {
      let asignado = 0;
      nuevas = prev.map((d, i) => {
        const v = i === prev.length - 1 ? valor - asignado : Math.floor((toNum(d.valor) / prevTotal) * valor);
        asignado += v;
        return { trabajadorId: d.trabajadorId, trabajadorNombre: d.trabajadorNombre, valor: v };
      });
    }
  } else {
    // Nueva mano de obra sin trabajadores → no se puede distribuir
    throw new Error("Selecciona los trabajadores para la mano de obra");
  }

  const descripcion = `${credito.tipo === "nosdebe" ? "Nos Debe" : credito.concepto || "Crédito"} — ${credito.nombreCliente}`;

  let moId: number;
  if (existing) {
    await tx
      .update(manoObraTable)
      .set({ fecha: credito.fechaFactura, descripcion, valorTotal: String(valor) })
      .where(eq(manoObraTable.id, existing.id));
    moId = existing.id;
  } else {
    const [mo] = await tx
      .insert(manoObraTable)
      .values({ fecha: credito.fechaFactura, descripcion, valorTotal: String(valor), creditoId: credito.id })
      .returning();
    moId = mo.id;
  }

  for (const d of nuevas) {
    await tx.insert(distribucionesTable).values({
      manoObraId: moId,
      trabajadorId: d.trabajadorId,
      trabajadorNombre: d.trabajadorNombre,
      valor: String(d.valor),
      descuentoSeguro: "0",
      descuentoOtros: "0",
    });
    await ajustarTotalGanado(tx, d.trabajadorId, d.valor);
  }
}

const MO_NOMBRE = "Mano de Obra";
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
    manoObra,
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
    manoObra?: CreditoManoObraInput | null;
  };

  let credito;
  try {
    credito = await db.transaction(async (tx) => {
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
    if (manoObra !== undefined) await syncManoObraCredito(tx, created, manoObra);
    return created;
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Error al crear el crédito" });
    return;
  }

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
    manoObra,
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
    manoObra?: CreditoManoObraInput | null;
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

  let credito;
  try {
    credito = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(creditosTable)
      .set(updateData)
      .where(eq(creditosTable.id, id))
      .returning();

    if (Array.isArray(lineas)) {
      const keepIds = lineas
        .map((linea) => linea.id)
        .filter((lineaId): lineaId is number => typeof lineaId === "number");
      if (keepIds.length > 0) {
        await tx
          .delete(creditoLineasTable)
          .where(and(eq(creditoLineasTable.creditoId, id), notInArray(creditoLineasTable.id, keepIds)));
      } else {
        await tx.delete(creditoLineasTable).where(eq(creditoLineasTable.creditoId, id));
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
          await tx
            .update(creditoLineasTable)
            .set(values)
            .where(and(eq(creditoLineasTable.id, linea.id), eq(creditoLineasTable.creditoId, id)));
        } else {
          await tx.insert(creditoLineasTable).values(values);
        }
      }
    }

    // Sincronizar mano de obra solo si el campo viene en el body (undefined = sin cambios)
    if (manoObra !== undefined) await syncManoObraCredito(tx, updated, manoObra);

    return updated;
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Error al actualizar el crédito" });
    return;
  }

  res.json(await mapCredito(credito));
});

// POST /creditos/:id/abono — registra un nuevo abono y crea filas en ventas_diarias
router.post("/:id/abono", async (req, res) => {
  const creditoId = parseInt(req.params.id);
  const { valor, lineas, customRef } = req.body as { valor: number; lineas: { lineaId: number; valor: number }[]; customRef?: string };
  const abonoTotal = parseFloat(String(valor));

  if (!Number.isFinite(abonoTotal) || abonoTotal <= 0 || !Array.isArray(lineas) || lineas.length === 0) {
    res.status(400).json({ error: "Selecciona al menos un producto y un valor válido" });
    return;
  }

  const [credito] = await db.select().from(creditosTable).where(eq(creditosTable.id, creditoId));
  if (!credito) {
    res.status(404).json({ error: "Credito no encontrado" });
    return;
  }

  const lineIds = lineas.map((linea) => linea.lineaId);
  const creditLines = await db
    .select()
    .from(creditoLineasTable)
    .where(and(eq(creditoLineasTable.creditoId, creditoId), inArray(creditoLineasTable.id, lineIds)));
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
  const updated = await db.transaction(async (tx) => {
    // Aplicar el abono a las líneas del crédito
    for (const { linea, valor: av } of applied) {
      await tx
        .update(creditoLineasTable)
        .set({ valorAbonado: String(toNum(linea.valorAbonado) + av) })
        .where(eq(creditoLineasTable.id, linea.id));
    }

    // Actualizar valorAbonado del crédito
    const newAbonado = toNum(credito.valorAbonado) + appliedTotal;
    const [updatedCredito] = await tx
      .update(creditosTable)
      .set({ valorAbonado: String(newAbonado), actualizadoEn: new Date() })
      .where(eq(creditosTable.id, creditoId))
      .returning();

    // Insertar el nuevo registro de abono con detalle por línea
    const lineaDetalle = customRef
      ? JSON.stringify({ ref: customRef, lineas: applied.map((a) => ({ lineaId: a.linea.id, valor: a.valor })) })
      : JSON.stringify(applied.map((a) => ({ lineaId: a.linea.id, valor: a.valor })));
    const [newAbono] = await tx
      .insert(abonosCreditosTable)
      .values({ creditoId, valorTotal: String(appliedTotal), fecha: hoy, lineaDetalle })
      .returning();

    // Crear las filas de ventas_diarias para este abono
    for (const { linea, valor: av } of applied) {
      const total = toNum(linea.cantidad) * toNum(linea.precioVenta);
      const antes = toNum(linea.valorAbonado); // valor antes de este abono
      const restante = Math.max(0, total - antes);
      const pagaCompleto = Math.abs(av - restante) < 1;
      await crearFilaVentaPago(tx, updatedCredito, linea, av, pagaCompleto, newAbono.id, hoy, customRef);
    }

    return updatedCredito;
  });

  res.json(await mapCredito(updated));
});

// ── Helpers para revertir un abono ─────────────────────────────────────────
async function revertirAbono(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  abono: typeof abonosCreditosTable.$inferSelect,
) {
  // 1. Revertir valorAbonado en cada línea de crédito
  const _detRaw = abono.lineaDetalle ? JSON.parse(abono.lineaDetalle) : [];
  const lineas: { lineaId: number; valor: number }[] = Array.isArray(_detRaw) ? _detRaw : (_detRaw.lineas ?? []);
  for (const { lineaId, valor } of lineas) {
    const [linea] = await tx
      .select()
      .from(creditoLineasTable)
      .where(eq(creditoLineasTable.id, lineaId));
    if (linea) {
      const nuevo = Math.max(0, toNum(linea.valorAbonado) - valor);
      await tx
        .update(creditoLineasTable)
        .set({ valorAbonado: String(nuevo) })
        .where(eq(creditoLineasTable.id, lineaId));
    }
  }
  // 2. Revertir valorAbonado del crédito
  const [credito] = await tx
    .select()
    .from(creditosTable)
    .where(eq(creditosTable.id, abono.creditoId));
  if (credito) {
    const nuevoAbonado = Math.max(0, toNum(credito.valorAbonado) - toNum(abono.valorTotal));
    await tx
      .update(creditosTable)
      .set({ valorAbonado: String(nuevoAbonado), actualizadoEn: new Date() })
      .where(eq(creditosTable.id, abono.creditoId));
  }
  // 3. Eliminar filas de ventas_diarias vinculadas
  await tx
    .delete(ventasDiariasTable)
    .where(eq(ventasDiariasTable.creditoAbonoId, abono.id));
}

// DELETE /creditos/:id/abono/:abonoId — elimina un pago y revierte ventas
router.delete("/:id/abono/:abonoId", async (req, res) => {
  const creditoId = parseInt(req.params.id);
  const abonoId = parseInt(req.params.abonoId);

  const [abono] = await db
    .select()
    .from(abonosCreditosTable)
    .where(and(eq(abonosCreditosTable.id, abonoId), eq(abonosCreditosTable.creditoId, creditoId)));

  if (!abono) { res.status(404).json({ error: "Abono no encontrado" }); return; }

  const [credito] = await db.select().from(creditosTable).where(eq(creditosTable.id, creditoId));
  if (!credito) { res.json({ ok: true }); return; }
  res.json(await mapCredito(credito));
});

// PUT /creditos/:id/abono/:abonoId — edita un pago (revierte el anterior y aplica el nuevo)
router.put("/:id/abono/:abonoId", async (req, res) => {
  const creditoId = parseInt(req.params.id);
  const abonoId = parseInt(req.params.abonoId);
  const { valor, lineas, customRef } = req.body as { valor: number; lineas: { lineaId: number; valor: number }[]; customRef?: string };
  const abonoTotal = parseFloat(String(valor));

  if (!Number.isFinite(abonoTotal) || abonoTotal <= 0 || !Array.isArray(lineas) || lineas.length === 0) {
    res.status(400).json({ error: "Selecciona al menos un producto y un valor válido" });
    return;
  }

  const [abono] = await db
    .select()
    .from(abonosCreditosTable)
    .where(and(eq(abonosCreditosTable.id, abonoId), eq(abonosCreditosTable.creditoId, creditoId)));

  if (!abono) { res.status(404).json({ error: "Abono no encontrado" }); return; }

  const [credito] = await db.select().from(creditosTable).where(eq(creditosTable.id, creditoId));
  if (!credito) { res.status(404).json({ error: "Crédito no encontrado" }); return; }

  const updated = await db.transaction(async (tx) => {
    // Revertir el abono anterior
    await revertirAbono(tx, abono);

    // Releer líneas del crédito después de la reversión
    const lineIds = lineas.map((l) => l.lineaId);
    const creditLines = await tx
      .select()
      .from(creditoLineasTable)
      .where(and(eq(creditoLineasTable.creditoId, creditoId), inArray(creditoLineasTable.id, lineIds)));
    const byId = new Map(creditLines.map((l) => [l.id, l]));

    let appliedTotal = 0;
    const applied: Array<{ linea: typeof creditoLineasTable.$inferSelect; valor: number }> = [];
    for (const requested of lineas) {
      const linea = byId.get(requested.lineaId);
      if (!linea) continue;
      const requestedValue = parseFloat(String(requested.valor));
      const remaining = Math.max(0, toNum(linea.cantidad) * toNum(linea.precioVenta) - toNum(linea.valorAbonado));
      const appliedValue = Math.min(requestedValue, remaining);
      if (appliedValue > 0) { appliedTotal += appliedValue; applied.push({ linea, valor: appliedValue }); }
    }
    if (applied.length === 0) throw new Error("Sin líneas válidas para el nuevo valor");

    // Aplicar nuevo abono a líneas
    for (const { linea, valor: av } of applied) {
      await tx
        .update(creditoLineasTable)
        .set({ valorAbonado: String(toNum(linea.valorAbonado) + av) })
        .where(eq(creditoLineasTable.id, linea.id));
    }

    // Releer crédito (ya actualizado por revertirAbono)
    const [creditoRevertido] = await tx.select().from(creditosTable).where(eq(creditosTable.id, creditoId));
    const newAbonado = toNum(creditoRevertido.valorAbonado) + appliedTotal;
    const [updatedCredito] = await tx
      .update(creditosTable)
      .set({ valorAbonado: String(newAbonado), actualizadoEn: new Date() })
      .where(eq(creditosTable.id, creditoId))
      .returning();

    // Actualizar el registro del abono con el nuevo valor y detalle
    const hoy = new Date().toISOString().split("T")[0];
    const lineaDetalle = customRef
      ? JSON.stringify({ ref: customRef, lineas: applied.map((a) => ({ lineaId: a.linea.id, valor: a.valor })) })
      : JSON.stringify(applied.map((a) => ({ lineaId: a.linea.id, valor: a.valor })));
    await tx
      .update(abonosCreditosTable)
      .set({ valorTotal: String(appliedTotal), fecha: hoy, lineaDetalle })
      .where(eq(abonosCreditosTable.id, abonoId));

    // Reconstruir TODAS las filas de Ventas de los pagos de este crédito en orden
    // cronológico (el estado completo/parcial de otros pagos puede haber cambiado)
    await rebuildVentasCredito(tx, updatedCredito);

    return updatedCredito;
  });

  res.json(await mapCredito(updated));
});

// DELETE /creditos/:id
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.transaction(async (tx) => {
    // Revertir y eliminar la mano de obra vinculada (resta totalGanado de los trabajadores)
    const [existing] = await tx.select().from(creditosTable).where(eq(creditosTable.id, id));
    if (existing) await syncManoObraCredito(tx, existing, null);
    await tx.delete(creditoLineasTable).where(eq(creditoLineasTable.creditoId, id));
    await tx.delete(abonosCreditosTable).where(eq(abonosCreditosTable.creditoId, id));
    await tx.delete(creditosTable).where(eq(creditosTable.id, id));
  });
  res.json({ mensaje: "Credito eliminado" });
});

export default router;

/** Referencia (No.Remisión/Ref) para filas de ventas_diarias generadas desde un crédito/nos debe. */
function refCredito(credito: typeof creditosTable.$inferSelect, customRef?: string): string {
  if (customRef) return customRef;
  const nombre = abreviarNombre(credito.nombreCliente);
  if (credito.tipo === "nosdebe") return nombre;
  // Para créditos: incluir fecha corta (dd/mm/aa) para facilitar rastreo en impresión
  const fecha = credito.fechaFactura
    ? (() => { const [y, m, d] = credito.fechaFactura.split("-"); return `${d}/${m}/${y.slice(2)}`; })()
    : "";
  return [credito.concepto, nombre, fecha].filter(Boolean).join(" ");
}

/**
 * Crea la fila de ventas_diarias correspondiente al pago (total o parcial) de una línea.
 * - Pago completo de producto → fila "venta" (suma al total).
 * - Pago completo de mano de obra → fila "manoobra" con trabajadores (no suma al total).
 * - Pago parcial → fila "credito" tipo Abono (no suma al total).
 * En todos los casos la referencia lleva el concepto/nombre del crédito.
 */
async function crearFilaVentaPago(
  tx: Tx,
  credito: typeof creditosTable.$inferSelect,
  linea: typeof creditoLineasTable.$inferSelect,
  appliedValue: number,
  pagaCompleto: boolean,
  abonoId: number,
  fecha: string,
  customRef?: string,
) {
  const referencia = refCredito(credito, customRef);
  const etiqueta = credito.tipo === "nosdebe" ? "Nos Debe" : "crédito";

  if (pagaCompleto && linea.productoNombre === MO_NOMBRE) {
    const { nombres, detalle } = await trabajadoresManoObra(tx, credito.id);
    const valor = toNum(linea.cantidad) * toNum(linea.precioVenta);
    await tx.insert(ventasDiariasTable).values({
      fecha,
      referencia,
      tipoLinea: "manoobra",
      productoNombre: MO_NOMBRE,
      productoMarca: nombres || linea.productoMarca || null,
      cantidad: "1",
      precioCompraUnidad: "0",
      precioVentaUnidad: String(valor),
      precioVentaTotal: String(valor),
      beneficio: String(valor),
      descripcion: detalle || `Pago ${etiqueta}${credito.concepto ? ` ${credito.concepto}` : ""}`,
      creditoAbonoId: abonoId,
    });
    return;
  }

  if (pagaCompleto) {
    const pvUnidad = toNum(linea.precioVenta);
    const pcUnidad = toNum(linea.precioCompra ?? "0");
    const cant = toNum(linea.cantidad);
    await tx.insert(ventasDiariasTable).values({
      fecha,
      referencia,
      tipoLinea: "venta",
      productoId: linea.productoId ?? null,
      productoNombre: linea.productoNombre,
      productoCodigo: linea.productoCodigo ?? null,
      productoMarca: linea.productoMarca ?? null,
      cantidad: String(cant),
      precioCompraUnidad: String(pcUnidad),
      precioVentaUnidad: String(pvUnidad),
      precioVentaTotal: String(pvUnidad * cant),
      beneficio: String((pvUnidad - pcUnidad) * cant),
      descripcion: `Pago ${etiqueta}${credito.concepto ? ` ${credito.concepto}` : ""}`,
      creditoAbonoId: abonoId,
    });
    return;
  }

  await tx.insert(ventasDiariasTable).values({
    fecha,
    referencia,
    tipoLinea: "credito",
    productoNombre: `Abono A: ${linea.productoNombre}`,
    productoMarca: credito.nombreCliente,
    cantidad: "1",
    precioCompraUnidad: "0",
    precioVentaUnidad: String(appliedValue),
    precioVentaTotal: String(appliedValue),
    beneficio: "0",
    descripcion: `Abono a ${etiqueta} - ${credito.nombreCliente}`,
    creditoAbonoId: abonoId,
  });
}

/**
 * Reconstruye TODAS las filas de ventas_diarias asociadas a los pagos de un crédito,
 * reproduciendo los abonos en orden cronológico. Garantiza que tras editar o eliminar
 * un pago exista a lo sumo una fila venta/manoobra por línea totalmente saldada y
 * filas "Abono A" para los pagos parciales.
 */
async function rebuildVentasCredito(tx: Tx, credito: typeof creditosTable.$inferSelect) {
  const abonos = await tx
    .select()
    .from(abonosCreditosTable)
    .where(eq(abonosCreditosTable.creditoId, credito.id))
    .orderBy(abonosCreditosTable.creadoEn, abonosCreditosTable.id);
  // Solo se pueden reconstruir los abonos con detalle por línea
  const conDetalle = abonos.filter((a) => a.lineaDetalle);
  if (conDetalle.length > 0) {
    await tx.delete(ventasDiariasTable).where(
      inArray(ventasDiariasTable.creditoAbonoId, conDetalle.map((a) => a.id)),
    );
  }

  const lineas = await tx.select().from(creditoLineasTable).where(eq(creditoLineasTable.creditoId, credito.id));
  const byId = new Map(lineas.map((l) => [l.id, l]));

  // Punto de partida por línea: lo abonado que NO proviene de estos abonos (p.ej. abono inicial)
  const running = new Map<number, number>();
  for (const l of lineas) {
    let sumAbonos = 0;
    for (const a of conDetalle) {
      const _rd = JSON.parse(a.lineaDetalle!);
      const det: { lineaId: number; valor: number }[] = Array.isArray(_rd) ? _rd : (_rd.lineas ?? []);
      sumAbonos += det.filter((d) => d.lineaId === l.id).reduce((s, d) => s + d.valor, 0);
    }
    running.set(l.id, Math.max(0, toNum(l.valorAbonado) - sumAbonos));
  }

  for (const abono of conDetalle) {
    const _raw = JSON.parse(abono.lineaDetalle!);
    const det: { lineaId: number; valor: number }[] = Array.isArray(_raw) ? _raw : (_raw.lineas ?? []);
    const abonoCustomRef: string | undefined = Array.isArray(_raw) ? undefined : (_raw.ref ?? undefined);
    for (const { lineaId, valor } of det) {
      const linea = byId.get(lineaId);
      if (!linea || valor <= 0) continue;
      const total = toNum(linea.cantidad) * toNum(linea.precioVenta);
      const antes = running.get(lineaId) ?? 0;
      const restante = Math.max(0, total - antes);
      const pagaCompleto = Math.abs(valor - restante) < 1;
      await crearFilaVentaPago(tx, credito, linea, valor, pagaCompleto, abono.id, abono.fecha, abonoCustomRef);
      running.set(lineaId, antes + valor);
    }
  }
}

/** Obtiene los trabajadores de la mano de obra vinculada a un crédito. */
async function trabajadoresManoObra(tx: Tx, creditoId: number) {
  const [mo] = await tx.select().from(manoObraTable).where(eq(manoObraTable.creditoId, creditoId));
  if (!mo) return { nombres: "", detalle: "" };
  const dists = await tx.select().from(distribucionesTable).where(eq(distribucionesTable.manoObraId, mo.id));
  return {
    nombres: dists.map((d) => d.trabajadorNombre).join(", "),
    detalle: dists.map((d) => `${d.trabajadorNombre}: $${toNum(d.valor).toLocaleString("es-CO")}`).join(" | "),
  };
}
