import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { distribucionesTable, eventosSincronizacionTable, manoObraTable, operacionesSincronizadasTable, trabajadoresTable } from "@workspace/db/schema";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { operacionYaProcesada } from "./lib/operacion-sincronizada";

const router: IRouter = Router();

function toNum(v: unknown): number {
  return typeof v === "string" ? parseFloat(v) : Number(v);
}

async function bloquearTrabajadores(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  trabajadorIds: number[],
): Promise<void> {
  const ids = [...new Set(trabajadorIds)].sort((a, b) => a - b);
  if (ids.length === 0) return;
  await tx
    .select({ id: trabajadoresTable.id })
    .from(trabajadoresTable)
    .where(inArray(trabajadoresTable.id, ids))
    .orderBy(asc(trabajadoresTable.id))
    .for("update");
}

async function ajustarTotalGanado(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  trabajadorId: number,
  valor: string,
  operacion: "sumar" | "restar",
): Promise<void> {
  const total = trabajadoresTable.totalGanado;
  await tx
    .update(trabajadoresTable)
    .set({
      totalGanado: operacion === "sumar"
        ? sql`${total} + ${valor}`
        : sql`${total} - ${valor}`,
    })
    .where(eq(trabajadoresTable.id, trabajadorId));
}

async function getManoObraConDistribuciones(manoObraId: number) {
  const [mo] = await db.select().from(manoObraTable).where(eq(manoObraTable.id, manoObraId));
  if (!mo) return null;
  const distribuciones = await db.select().from(distribucionesTable).where(eq(distribucionesTable.manoObraId, manoObraId));
  return {
    id: mo.id,
    fecha: mo.fecha,
    descripcion: mo.descripcion,
    valorTotal: toNum(mo.valorTotal),
    distribuciones: distribuciones.map(d => ({
      id: d.id,
      trabajadorId: d.trabajadorId,
      trabajadorNombre: d.trabajadorNombre,
      valor: toNum(d.valor),
      descuentoSeguro: toNum(d.descuentoSeguro),
      descuentoOtros: toNum(d.descuentoOtros),
    })),
    creadoEn: mo.creadoEn,
  };
}

router.get("/", async (req, res) => {
  const { fecha } = req.query;
  let mos;
  if (fecha) {
    mos = await db.select().from(manoObraTable).where(eq(manoObraTable.fecha, String(fecha)));
  } else {
    mos = await db.select().from(manoObraTable).orderBy(manoObraTable.fecha);
  }

  const results = await Promise.all(mos.map(mo => getManoObraConDistribuciones(mo.id)));
  res.json(results.filter(Boolean));
});

router.post("/", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const { fecha, descripcion, valorTotal, distribuciones } = req.body;

  const resultado = await db.transaction(async (tx) => {
    const ya = await operacionYaProcesada(tx, operationId);
    if (ya) return { yaProcesado: ya } as const;

    const listaDistribuciones = Array.isArray(distribuciones) ? distribuciones : [];
    await bloquearTrabajadores(
      tx,
      listaDistribuciones.map((dist: { trabajadorId: number }) => dist.trabajadorId),
    );
    const [mo] = await tx.insert(manoObraTable).values({
      fecha,
      descripcion,
      valorTotal: String(parseFloat(valorTotal)),
    }).returning();

    for (const dist of listaDistribuciones) {
      const valor = String(parseFloat(dist.valor));
      await tx.insert(distribucionesTable).values({
        manoObraId: mo.id,
        trabajadorId: dist.trabajadorId,
        trabajadorNombre: dist.trabajadorNombre || `Trabajador ${dist.trabajadorId}`,
        valor,
        descuentoSeguro: String(parseFloat(dist.descuentoSeguro || 0)),
        descuentoOtros: String(parseFloat(dist.descuentoOtros || 0)),
      });
      await ajustarTotalGanado(tx, dist.trabajadorId, valor, "sumar");
    }

    if (!req.header("x-sync-apply")) {
      await tx.insert(eventosSincronizacionTable).values({
        operationId,
        entidad: "mano_obra",
        entidadId: String(mo.id),
        tipo: "crear",
        metodo: "POST",
        endpoint: "/manoobra",
        payload: req.body,
        origen: "local",
      });
    }
    await tx.insert(operacionesSincronizadasTable).values({
      operationId,
      tipo: "mano_obra",
      recursoId: mo.id,
    }).onConflictDoNothing();
    return { manoObraId: mo.id } as const;
  });

  if (resultado.yaProcesado) {
    res.status(200).json({
      ok: true,
      yaProcesado: true,
      recursoId: resultado.yaProcesado.recursoId,
    });
    return;
  }
  res.status(201).json(await getManoObraConDistribuciones(resultado.manoObraId));
});

router.put("/:id", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = parseInt(req.params.id);
  const { fecha, descripcion, valorTotal, distribuciones } = req.body;

  const resultado = await db.transaction(async (tx) => {
    const ya = await operacionYaProcesada(tx, operationId);
    if (ya) return { yaProcesado: ya } as const;

    const [existente] = await tx
      .select()
      .from(manoObraTable)
      .where(eq(manoObraTable.id, id))
      .for("update");
    if (existente?.creditoId) return { credito: true } as const;

    await tx.update(manoObraTable).set({
      fecha,
      descripcion,
      valorTotal: String(parseFloat(valorTotal)),
    }).where(eq(manoObraTable.id, id));

    if (Array.isArray(distribuciones)) {
      const anteriores = await tx
        .select()
        .from(distribucionesTable)
        .where(eq(distribucionesTable.manoObraId, id));
      await bloquearTrabajadores(
        tx,
        [
          ...anteriores.map((dist) => dist.trabajadorId),
          ...distribuciones.map((dist: { trabajadorId: number }) => dist.trabajadorId),
        ],
      );
      await tx.delete(distribucionesTable).where(eq(distribucionesTable.manoObraId, id));
      for (const anterior of anteriores) {
        await ajustarTotalGanado(tx, anterior.trabajadorId, String(anterior.valor), "restar");
      }
      for (const dist of distribuciones) {
        const valor = String(parseFloat(dist.valor));
        await tx.insert(distribucionesTable).values({
          manoObraId: id,
          trabajadorId: dist.trabajadorId,
          trabajadorNombre: dist.trabajadorNombre || `Trabajador ${dist.trabajadorId}`,
          valor,
          descuentoSeguro: String(parseFloat(dist.descuentoSeguro || 0)),
          descuentoOtros: String(parseFloat(dist.descuentoOtros || 0)),
        });
        await ajustarTotalGanado(tx, dist.trabajadorId, valor, "sumar");
      }
    }

    if (!req.header("x-sync-apply")) {
      await tx.insert(eventosSincronizacionTable).values({
        operationId,
        entidad: "mano_obra",
        entidadId: String(id),
        tipo: "actualizar",
        metodo: "PUT",
        endpoint: `/manoobra/${id}`,
        payload: req.body,
        origen: "local",
      });
    }
    await tx.insert(operacionesSincronizadasTable).values({
      operationId,
      tipo: "mano_obra",
      recursoId: id,
    }).onConflictDoNothing();
    return { manoObraId: id } as const;
  });

  if (resultado.yaProcesado) {
    res.status(200).json({
      ok: true,
      yaProcesado: true,
      recursoId: resultado.yaProcesado.recursoId,
    });
    return;
  }
  if ("credito" in resultado) {
    res.status(409).json({ error: "Esta mano de obra pertenece a un crédito/Nos Debe; edítala desde ese registro" });
    return;
  }
  res.json(await getManoObraConDistribuciones(resultado.manoObraId));
});

router.delete("/:id", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = parseInt(req.params.id);
  const resultado = await db.transaction(async (tx) => {
    const ya = await operacionYaProcesada(tx, operationId);
    if (ya) return { yaProcesado: ya } as const;

    const [existente] = await tx
      .select()
      .from(manoObraTable)
      .where(eq(manoObraTable.id, id))
      .for("update");
    if (existente?.creditoId) return { credito: true } as const;
    const distribuciones = await tx
      .select()
      .from(distribucionesTable)
      .where(eq(distribucionesTable.manoObraId, id));
    await bloquearTrabajadores(tx, distribuciones.map((dist) => dist.trabajadorId));
    await tx.delete(distribucionesTable).where(eq(distribucionesTable.manoObraId, id));
    for (const dist of distribuciones) {
      await ajustarTotalGanado(tx, dist.trabajadorId, String(dist.valor), "restar");
    }
    await tx.delete(manoObraTable).where(eq(manoObraTable.id, id));
    if (!req.header("x-sync-apply")) {
      await tx.insert(eventosSincronizacionTable).values({
        operationId,
        entidad: "mano_obra",
        entidadId: String(id),
        tipo: "eliminar",
        metodo: "DELETE",
        endpoint: `/manoobra/${id}`,
        payload: {},
        origen: "local",
      });
    }
    await tx.insert(operacionesSincronizadasTable).values({
      operationId,
      tipo: "mano_obra",
      recursoId: id,
    }).onConflictDoNothing();
    return { eliminada: true } as const;
  });

  if (resultado.yaProcesado) {
    res.status(200).json({
      ok: true,
      yaProcesado: true,
      recursoId: resultado.yaProcesado.recursoId,
    });
    return;
  }
  if ("credito" in resultado) {
    res.status(409).json({ error: "Esta mano de obra pertenece a un crédito/Nos Debe; elimínala desde ese registro" });
    return;
  }
  res.json({ mensaje: "Mano de obra eliminada" });
});

export default router;
