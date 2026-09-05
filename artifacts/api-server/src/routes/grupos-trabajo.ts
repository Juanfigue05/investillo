import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { gruposTrabajoDefaultTable, trabajadoresTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

const router: IRouter = Router();

function normalizarIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
}

function mismaCombinacion(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

router.get("/", async (_req, res) => {
  const grupos = await db.select().from(gruposTrabajoDefaultTable).where(eq(gruposTrabajoDefaultTable.activo, true));
  const todosIds = [...new Set(grupos.flatMap((g) => g.trabajadorIds))];
  const trabs = todosIds.length ? await db.select().from(trabajadoresTable).where(inArray(trabajadoresTable.id, todosIds)) : [];
  const nombrePorId = new Map(trabs.map((t) => [t.id, t.nombre]));

  const unicos: typeof grupos = [];
  for (const grupo of grupos) {
    const ids = normalizarIds(grupo.trabajadorIds);
    if (unicos.some((existente) => mismaCombinacion(normalizarIds(existente.trabajadorIds), ids))) continue;
    unicos.push(grupo);
  }

  res.json(unicos.map((g) => ({
    id: g.id,
    trabajadorIds: normalizarIds(g.trabajadorIds),
    nombres: normalizarIds(g.trabajadorIds).map((id) => nombrePorId.get(id) || `Trabajador ${id}`),
  })));
});

router.post("/", async (req, res) => {
  const { trabajadorIds } = req.body as { trabajadorIds: number[] };
  const idsNormalizados = normalizarIds(trabajadorIds);
  if (idsNormalizados.length < 2) {
    res.status(400).json({ error: "Selecciona al menos 2 trabajadores" });
    return;
  }
  const activos = await db.select().from(gruposTrabajoDefaultTable).where(eq(gruposTrabajoDefaultTable.activo, true));
  const existente = activos.find((grupo) => mismaCombinacion(normalizarIds(grupo.trabajadorIds), idsNormalizados));
  if (existente) {
    res.status(200).json({ ...existente, trabajadorIds: idsNormalizados });
    return;
  }
  const [grupo] = await db.insert(gruposTrabajoDefaultTable).values({ trabajadorIds: idsNormalizados }).returning();
  res.status(201).json(grupo);
});

router.patch("/:id/desactivar", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.update(gruposTrabajoDefaultTable).set({ activo: false }).where(eq(gruposTrabajoDefaultTable.id, id));
  res.json({ ok: true });
});

export default router;