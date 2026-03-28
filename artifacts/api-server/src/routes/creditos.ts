import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { creditosTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function toNum(v: unknown): number {
  return typeof v === "string" ? parseFloat(v) : Number(v);
}

function mapCredito(c: typeof creditosTable.$inferSelect) {
  const valorCredito = toNum(c.valorCredito);
  const valorAbonado = toNum(c.valorAbonado);
  return {
    id: c.id,
    fechaFactura: c.fechaFactura,
    placaVehiculo: c.placaVehiculo,
    nombreCliente: c.nombreCliente,
    telefonoCliente: c.telefonoCliente,
    descripcion: c.descripcion,
    valorCredito,
    valorAbonado,
    valorRestante: valorCredito - valorAbonado,
    creadoEn: c.creadoEn,
    actualizadoEn: c.actualizadoEn,
  };
}

router.get("/", async (req, res) => {
  const creditos = await db.select().from(creditosTable).orderBy(creditosTable.creadoEn);
  res.json(creditos.map(mapCredito));
});

router.post("/", async (req, res) => {
  const { fechaFactura, placaVehiculo, nombreCliente, telefonoCliente, descripcion, valorCredito, valorAbonado } = req.body;

  const [credito] = await db.insert(creditosTable).values({
    fechaFactura,
    placaVehiculo: placaVehiculo || null,
    nombreCliente,
    telefonoCliente: telefonoCliente || null,
    descripcion: descripcion || null,
    valorCredito: String(parseFloat(valorCredito)),
    valorAbonado: String(parseFloat(valorAbonado || 0)),
  }).returning();

  res.status(201).json(mapCredito(credito));
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { valorAbonado, descripcion, nombreCliente, placaVehiculo, telefonoCliente, fechaFactura, valorCredito } = req.body;

  const [existing] = await db.select().from(creditosTable).where(eq(creditosTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Credito no encontrado" });
    return;
  }

  const updateData: Partial<typeof creditosTable.$inferInsert> = {
    actualizadoEn: new Date(),
  };

  if (valorAbonado !== undefined) updateData.valorAbonado = String(parseFloat(valorAbonado));
  if (descripcion !== undefined) updateData.descripcion = descripcion;
  if (nombreCliente !== undefined) updateData.nombreCliente = nombreCliente;
  if (placaVehiculo !== undefined) updateData.placaVehiculo = placaVehiculo;
  if (telefonoCliente !== undefined) updateData.telefonoCliente = telefonoCliente;
  if (fechaFactura !== undefined) updateData.fechaFactura = fechaFactura;
  if (valorCredito !== undefined) updateData.valorCredito = String(parseFloat(valorCredito));

  const [credito] = await db.update(creditosTable).set(updateData).where(eq(creditosTable.id, id)).returning();
  res.json(mapCredito(credito));
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(creditosTable).where(eq(creditosTable.id, id));
  res.json({ mensaje: "Credito eliminado" });
});

export default router;
