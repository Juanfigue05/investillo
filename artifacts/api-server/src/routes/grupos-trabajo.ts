import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { gruposTrabajoDefaultTable, trabajadoresTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (_req, res) => {
  const grupos = await db.select().from(gruposTrabajoDefaultTable).where(eq(gruposTrabajoDefaultTable.activo, true));
  const todosIds = [...new Set(grupos.flatMap((g) => g.trabajadorIds))];
  const trabs = todosIds.length ? await db.select().from(trabajadoresTable).where(inArray(trabajadoresTable.id, todosIds)) : [];
  const nombrePorId = new Map(trabs.map((t) => [t.id, t.nombre]));

  res.json(grupos.map((g) => ({
    id: g.id,
    trabajadorIds: g.trabajadorIds,
    nombres: g.trabajadorIds.map((id) => nombrePorId.get(id) || `Trabajador ${id}`),
  })));
});

router.post("/", async (req, res) => {
  const { trabajadorIds } = req.body as { trabajadorIds: number[] };
  if (!Array.isArray(trabajadorIds) || trabajadorIds.length < 2) {
    res.status(400).json({ error: "Selecciona al menos 2 trabajadores" });
    return;
  }
  const [grupo] = await db.insert(gruposTrabajoDefaultTable).values({ trabajadorIds }).returning();
  res.status(201).json(grupo);
});

router.patch("/:id/desactivar", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.update(gruposTrabajoDefaultTable).set({ activo: false }).where(eq(gruposTrabajoDefaultTable.id, id));
  res.json({ ok: true });
});

export default router;