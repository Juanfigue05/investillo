import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { clientesTable, vehiculosClienteTable } from "@workspace/db/schema";
import { eq, desc, ilike, or, and } from "drizzle-orm";
import { operacionesSincronizadasTable } from "@workspace/db/schema";

const router: IRouter = Router();

async function mapCliente(c: typeof clientesTable.$inferSelect) {
  const vehiculos = await db
    .select()
    .from(vehiculosClienteTable)
    .where(eq(vehiculosClienteTable.clienteId, c.id))
    .orderBy(vehiculosClienteTable.id);
  return {
    id: c.id,
    nombre: c.nombre,
    telefono: c.telefono ?? null,
    correo: c.correo ?? null,
    notas: c.notas ?? null,
    creadoEn: c.creadoEn,
    actualizadoEn: c.actualizadoEn,
    vehiculos: vehiculos.map((v) => ({
      id: v.id,
      clienteId: v.clienteId,
      placa: v.placa,
      descripcion: v.descripcion ?? null,
      creadoEn: v.creadoEn,
    })),
  };
}

// GET /clientes?q=texto
router.get("/", async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const rows = q
    ? await db
        .select()
        .from(clientesTable)
        .where(
          or(
            ilike(clientesTable.nombre, `%${q}%`),
            ilike(clientesTable.telefono, `%${q}%`),
            ilike(clientesTable.correo, `%${q}%`),
          ),
        )
        .orderBy(desc(clientesTable.creadoEn))
    : await db.select().from(clientesTable).orderBy(desc(clientesTable.creadoEn));
  res.json(await Promise.all(rows.map(mapCliente)));
});

// GET /clientes/:id
router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [c] = await db.select().from(clientesTable).where(eq(clientesTable.id, id));
  if (!c) { res.status(404).json({ error: "Cliente no encontrado" }); return; }
  res.json(await mapCliente(c));
});

/** Valida: los 2 números de un mismo cliente no pueden ser iguales entre sí,
 *  y ninguno puede estar ya usado (como telefono o telefono2) por OTRO cliente. */
async function validarTelefonos(telefono: string | null, telefono2: string | null, clienteIdActual: number | null): Promise<string | null> {
  const t1 = telefono?.trim() || null;
  const t2 = telefono2?.trim() || null;

  if (t1 && t2 && t1 === t2) {
    return "Los dos números de teléfono no pueden ser iguales";
  }

  const numeros = [t1, t2].filter((t): t is string => !!t);
  if (numeros.length === 0) return null;

  const condiciones = numeros.flatMap((num) => [eq(clientesTable.telefono, num), eq(clientesTable.telefono2, num)]);
  const posiblesConflictos = await db
    .select({ id: clientesTable.id, nombre: clientesTable.nombre })
    .from(clientesTable)
    .where(or(...condiciones));

  for (const c of posiblesConflictos) {
    if (clienteIdActual !== null && c.id === clienteIdActual) continue; // no cuenta contra sí mismo
    return `Ese número ya está registrado con el cliente "${c.nombre}"`;
  }

  return null;
}

// POST /clientes
router.post("/", async (req, res) => {
  const operationId = req.header("x-operation-id");
  if (operationId) {
    const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
    if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  }

  const { nombre, telefono, telefono2, correo, notas, vehiculos = [] } = req.body as {
    nombre: string;
    telefono?: string;
    telefono2?: string;
    correo?: string;
    notas?: string;
    vehiculos?: { placa: string; descripcion?: string }[];
  };
  if (!nombre?.trim()) { res.status(400).json({ error: "Nombre es obligatorio" }); return; }

  const errorTelefono = await validarTelefonos(telefono || null, telefono2 || null, null);
  if (errorTelefono) { res.status(400).json({ error: errorTelefono }); return; }

  const cliente = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(clientesTable)
      .values({ nombre: nombre.trim(), telefono: telefono || null, telefono2: telefono2 || null, correo: correo || null, notas: notas || null })
      .returning();
    if (Array.isArray(vehiculos) && vehiculos.length > 0) {
      const validVehiculos = vehiculos.filter((v) => v.placa?.trim());
      if (validVehiculos.length > 0) {
        await tx.insert(vehiculosClienteTable).values(
          validVehiculos.map((v) => ({ clienteId: created.id, placa: v.placa.trim(), descripcion: v.descripcion || null })),
        );
      }
    }
    return created;
  });
  if (operationId) {
    await db.insert(operacionesSincronizadasTable).values({ operationId, tipo: "cliente", recursoId: cliente.id }).onConflictDoNothing();
  }
  res.status(201).json(await mapCliente(cliente));
});

// PUT /clientes/:id
router.put("/:id", async (req, res) => {
  const operationId = req.header("x-operation-id");
  if (operationId) {
    const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
    if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  }

  const id = parseInt(req.params.id);
  const { nombre, telefono, telefono2, correo, notas } = req.body as {
    nombre?: string;
    telefono?: string | null;
    telefono2?: string | null;
    correo?: string | null;
    notas?: string | null;
  };
  const [existing] = await db.select().from(clientesTable).where(eq(clientesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Cliente no encontrado" }); return; }

  const telefonoFinal = telefono !== undefined ? telefono : existing.telefono;
  const telefono2Final = telefono2 !== undefined ? telefono2 : existing.telefono2;
  const errorTelefono = await validarTelefonos(telefonoFinal, telefono2Final, id);
  if (errorTelefono) { res.status(400).json({ error: errorTelefono }); return; }

  const update: Partial<typeof clientesTable.$inferInsert> = { actualizadoEn: new Date() };
  if (nombre !== undefined) update.nombre = nombre.trim();
  if (telefono !== undefined) update.telefono = telefono || null;
  if (telefono2 !== undefined) update.telefono2 = telefono2 || null;
  if (correo !== undefined) update.correo = correo || null;
  if (notas !== undefined) update.notas = notas || null;

  const [updated] = await db.update(clientesTable).set(update).where(eq(clientesTable.id, id)).returning();
  
  if (operationId) {
    await db.insert(operacionesSincronizadasTable).values({ operationId, tipo: "cliente", recursoId: id }).onConflictDoNothing();
  }
  res.json(await mapCliente(updated));
});

// DELETE /clientes/:id
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(vehiculosClienteTable).where(eq(vehiculosClienteTable.clienteId, id));
  await db.delete(clientesTable).where(eq(clientesTable.id, id));
  res.json({ mensaje: "Cliente eliminado" });
});

// POST /clientes/:id/vehiculos
router.post("/:id/vehiculos", async (req, res) => {
  const clienteId = parseInt(req.params.id);
  const { placa, descripcion } = req.body as { placa: string; descripcion?: string };
  if (!placa?.trim()) { res.status(400).json({ error: "Placa es obligatoria" }); return; }
  // Verify parent client exists
  const [cliente] = await db.select({ id: clientesTable.id }).from(clientesTable).where(eq(clientesTable.id, clienteId));
  if (!cliente) { res.status(404).json({ error: "Cliente no encontrado" }); return; }
  const [v] = await db
    .insert(vehiculosClienteTable)
    .values({ clienteId, placa: placa.trim(), descripcion: descripcion || null })
    .returning();
  res.status(201).json({ id: v.id, clienteId: v.clienteId, placa: v.placa, descripcion: v.descripcion ?? null, creadoEn: v.creadoEn });
});

// PUT /clientes/:id/vehiculos/:vid
router.put("/:id/vehiculos/:vid", async (req, res) => {
  const clienteId = parseInt(req.params.id);
  const vid = parseInt(req.params.vid);
  const { placa, descripcion } = req.body as { placa?: string; descripcion?: string | null };
  const update: Partial<typeof vehiculosClienteTable.$inferInsert> = {};
  if (placa !== undefined) update.placa = placa.trim();
  if (descripcion !== undefined) update.descripcion = descripcion || null;
  const [updated] = await db
    .update(vehiculosClienteTable)
    .set(update)
    .where(and(eq(vehiculosClienteTable.id, vid), eq(vehiculosClienteTable.clienteId, clienteId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Vehículo no encontrado" }); return; }
  res.json({ id: updated.id, clienteId: updated.clienteId, placa: updated.placa, descripcion: updated.descripcion ?? null, creadoEn: updated.creadoEn });
});

// DELETE /clientes/:id/vehiculos/:vid
router.delete("/:id/vehiculos/:vid", async (req, res) => {
  const clienteId = parseInt(req.params.id);
  const vid = parseInt(req.params.vid);
  const deleted = await db
    .delete(vehiculosClienteTable)
    .where(and(eq(vehiculosClienteTable.id, vid), eq(vehiculosClienteTable.clienteId, clienteId)))
    .returning();
  if (deleted.length === 0) { res.status(404).json({ error: "Vehículo no encontrado" }); return; }
  res.json({ mensaje: "Vehículo eliminado" });
});

export default router;
