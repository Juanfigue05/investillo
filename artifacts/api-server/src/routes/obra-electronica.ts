import { Router } from "express";
import { db } from "@workspace/db";
import { eventosSincronizacionTable, obraElectronicaTable, operacionesSincronizadasTable, trabajadoresTable } from "@workspace/db/schema";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { operacionYaProcesada } from "./lib/operacion-sincronizada";

const router = Router();

function parseValor(raw: unknown): number {
  const texto = String(raw ?? "").trim().replace(/\s/g, "").replace(",", ".");
  const numero = Number(texto);
  if (!Number.isFinite(numero) || numero < 0) return 0;
  return Math.round((numero < 1000 ? numero * 1000 : numero) * 100) / 100;
}

function inicioFinMes(mes: string) {
  if (!/^\d{4}-\d{2}$/.test(mes)) return null;
  const [anio, numeroMes] = mes.split("-").map(Number);
  const siguienteMes = new Date(anio, numeroMes, 1);
  const siguiente = `${siguienteMes.getFullYear()}-${String(siguienteMes.getMonth() + 1).padStart(2, "0")}-01`;
  return { desde: `${mes}-01`, siguiente };
}

function mapRegistro(registro: typeof obraElectronicaTable.$inferSelect) {
  return {
    id: registro.id,
    trabajadorId: registro.trabajadorId,
    empleadoNombre: registro.empleadoNombre,
    fecha: registro.fecha,
    numeroFactura: registro.numeroFactura,
    vehiculo: registro.vehiculo,
    valor: Number(registro.valor),
    creadoEn: registro.creadoEn,
  };
}

router.get("/", async (req, res) => {
  const mes = String(req.query.mes || "");
  const rango = inicioFinMes(mes);
  if (!rango) { res.status(400).json({ error: "El mes debe tener formato YYYY-MM" }); return; }
  const registros = await db.select().from(obraElectronicaTable)
    .where(and(gte(obraElectronicaTable.fecha, rango.desde), lt(obraElectronicaTable.fecha, rango.siguiente)))
    .orderBy(asc(obraElectronicaTable.fecha), asc(obraElectronicaTable.id));
  res.json(registros.map(mapRegistro));
});

router.post("/", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const { trabajadorId, fecha, numeroFactura, vehiculo } = req.body;
  const id = Number(trabajadorId);
  const valor = parseValor(req.body.valor);
  const resultado = await db.transaction(async (tx) => {
    const ya = await operacionYaProcesada(tx, operationId);
    if (ya) return { yaProcesado: ya } as const;
    if (!Number.isInteger(id) || !fecha) return { error: "Empleado y fecha son obligatorios", status: 400 } as const;
    if (valor <= 0) return { error: "El valor debe ser mayor que cero", status: 400 } as const;
    const [trabajador] = await tx.select({ id: trabajadoresTable.id, nombre: trabajadoresTable.nombre, obraElectronica: trabajadoresTable.obraElectronica })
      .from(trabajadoresTable).where(eq(trabajadoresTable.id, id)).limit(1);
    if (!trabajador) return { error: "Empleado no encontrado", status: 404 } as const;
    if (!trabajador.obraElectronica) return { error: "Este empleado no tiene habilitada la obra electrónica", status: 403 } as const;
    const [registro] = await tx.insert(obraElectronicaTable).values({
      trabajadorId: trabajador.id,
      empleadoNombre: trabajador.nombre,
      fecha,
      numeroFactura: String(numeroFactura || "").trim(),
      vehiculo: String(vehiculo || "").trim(),
      valor: String(valor),
    }).returning();
    if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "obra_electronica", entidadId: String(registro.id), tipo: "crear", metodo: "POST", endpoint: "/obra-electronica", payload: req.body, origen: "local" });
    await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "obra_electronica", recursoId: registro.id }).onConflictDoNothing();
    return { registro } as const;
  });
  if (resultado.yaProcesado) {
    res.status(200).json({ ok: true, yaProcesado: true, recursoId: resultado.yaProcesado.recursoId });
    return;
  }
  if (resultado.status !== undefined) { res.status(resultado.status).json({ error: resultado.error }); return; }
  res.status(201).json(mapRegistro(resultado.registro));
});

router.put("/:id", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = Number(req.params.id);
  const valor = parseValor(req.body.valor);
  const resultado = await db.transaction(async (tx) => {
    const ya = await operacionYaProcesada(tx, operationId);
    if (ya) return { yaProcesado: ya } as const;
    if (!Number.isInteger(id) || !req.body.fecha || valor <= 0) {
      return { error: "Fecha y valor válido son obligatorios", status: 400 } as const;
    }
    const [registro] = await tx.update(obraElectronicaTable).set({
      fecha: req.body.fecha,
      numeroFactura: String(req.body.numeroFactura || "").trim(),
      vehiculo: String(req.body.vehiculo || "").trim(),
      valor: String(valor),
    }).where(eq(obraElectronicaTable.id, id)).returning();
    if (!registro) return { error: "Registro no encontrado", status: 404 } as const;
    if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "obra_electronica", entidadId: String(id), tipo: "actualizar", metodo: "PUT", endpoint: `/obra-electronica/${id}`, payload: req.body, origen: "local" });
    await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "obra_electronica", recursoId: id }).onConflictDoNothing();
    return { registro } as const;
  });
  if (resultado.yaProcesado) {
    res.status(200).json({ ok: true, yaProcesado: true, recursoId: resultado.yaProcesado.recursoId });
    return;
  }
  if (resultado.status !== undefined) { res.status(resultado.status).json({ error: resultado.error }); return; }
  res.json(mapRegistro(resultado.registro));
});

router.delete("/:id", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const id = Number(req.params.id);
  const resultado = await db.transaction(async (tx) => {
    const ya = await operacionYaProcesada(tx, operationId);
    if (ya) return { yaProcesado: ya } as const;
    const [registro] = await tx.delete(obraElectronicaTable).where(eq(obraElectronicaTable.id, id)).returning({ id: obraElectronicaTable.id });
    if (!registro) return { error: "Registro no encontrado" } as const;
    if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "obra_electronica", entidadId: String(id), tipo: "eliminar", metodo: "DELETE", endpoint: `/obra-electronica/${id}`, payload: {}, origen: "local" });
    await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "obra_electronica", recursoId: id }).onConflictDoNothing();
    return { eliminado: true } as const;
  });
  if (resultado.yaProcesado) {
    res.status(200).json({ ok: true, yaProcesado: true, recursoId: resultado.yaProcesado.recursoId });
    return;
  }
  if ("error" in resultado) { res.status(404).json({ error: resultado.error }); return; }
  res.json({ ok: true });
});

export default router;
