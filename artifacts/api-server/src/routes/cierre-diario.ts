import { Router } from "express";
import { db } from "@workspace/db";
import { cierreDiarioTable, trabajadoresTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { operacionesSincronizadasTable } from "@workspace/db/schema";

const router = Router();

interface TrabajadorSnapshotIn {
  trabajadorId?: number | null;
  seguro?: string; // miles shorthand, e.g. "30" = 30000
}

function parseMiles(raw: unknown): number {
  const s = String(raw ?? "").trim();
  if (!s) return 0;
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? 0 : n * 1000;
}

/** Suma el seguro (en pesos) por trabajadorId dentro de un snapshot del día */
function seguroPorTrabajador(datos: unknown): Map<number, number> {
  const mapa = new Map<number, number>();
  if (!Array.isArray(datos)) return mapa;
  for (const item of datos as TrabajadorSnapshotIn[]) {
    if (!item?.trabajadorId) continue;
    const valor = parseMiles(item.seguro);
    mapa.set(item.trabajadorId, (mapa.get(item.trabajadorId) || 0) + valor);
  }
  return mapa;
}

router.get("/", async (_req, res) => {
  try {
    const rows = await db.select().from(cierreDiarioTable).orderBy(desc(cierreDiarioTable.fecha));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/", async (req, res) => {
  try {
    const { fecha, datos, totalPagar } = req.body as { fecha: string; datos: unknown; totalPagar: number };
    if (!fecha || !datos) { res.status(400).json({ error: "fecha y datos son requeridos" }); return; }

    const operationId = req.header("x-operation-id");
    if (operationId) {
      const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
      if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
    }

    const nuevo = seguroPorTrabajador(datos);

    const resultado = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(cierreDiarioTable).where(eq(cierreDiarioTable.fecha, fecha)).limit(1);
      const anterior = existing ? seguroPorTrabajador(existing.datos) : new Map<number, number>();

      // Calcula el delta (nuevo - anterior) por trabajador, para no duplicar si se edita un cierre ya guardado
      const idsAfectados = new Set([...nuevo.keys(), ...anterior.keys()]);
      for (const trabajadorId of idsAfectados) {
        const delta = (nuevo.get(trabajadorId) || 0) - (anterior.get(trabajadorId) || 0);
        if (delta !== 0) {
          await tx
            .update(trabajadoresTable)
            .set({ totalSeguroDescontado: sql`${trabajadoresTable.totalSeguroDescontado} + ${delta}` })
            .where(eq(trabajadoresTable.id, trabajadorId));
        }
      }

      if (existing) {
        const [updated] = await tx
          .update(cierreDiarioTable)
          .set({ datos: datos as any, totalPagar: totalPagar ?? 0 })
          .where(eq(cierreDiarioTable.fecha, fecha))
          .returning();
        return updated;
      }
      const [created] = await tx
        .insert(cierreDiarioTable)
        .values({ fecha, datos: datos as any, totalPagar: totalPagar ?? 0 })
        .returning();
      return created;
    });
    if (operationId && resultado) {
      await db.insert(operacionesSincronizadasTable).values({ operationId, tipo: "cierre_diario", recursoId: resultado.id }).onConflictDoNothing();
    }
    res.status(resultado ? 201 : 500).json(resultado);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(cierreDiarioTable).where(eq(cierreDiarioTable.id, id));
      if (existing) {
        const anterior = seguroPorTrabajador(existing.datos);
        for (const [trabajadorId, valor] of anterior) {
          await tx
            .update(trabajadoresTable)
            .set({ totalSeguroDescontado: sql`${trabajadoresTable.totalSeguroDescontado} - ${valor}` })
            .where(eq(trabajadoresTable.id, trabajadorId));
        }
      }
      await tx.delete(cierreDiarioTable).where(eq(cierreDiarioTable.id, id));
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;