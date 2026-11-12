import { Router } from "express";
import { db } from "@workspace/db";
import { eventosSincronizacionTable, obraElectronicaTable, operacionesSincronizadasTable, trabajadoresTable } from "@workspace/db/schema";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { operacionYaProcesada } from "./lib/operacion-sincronizada";

const router = Router();

function parseValor(raw: unknown): number {
  const texto = String(raw ?? "").trim().replace(/\s/g, "").replace(",", ".");
  const numero = Number(texto);
  if (!Number.isFinite(numero) || numero < 0) return 0;
  return Math.round((numero < 1000 ? numero * 1000 : numero) * 100) / 100;
}

function parseValorExacto(raw: unknown): number | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const numero = Number(String(raw ?? "").trim().replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(numero) || numero < 0) return null;
  return Math.round(numero * 100) / 100;
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
  const { fecha, numeroFactura, vehiculo } = req.body;
  const esLote = Array.isArray(req.body.trabajadores);
  const trabajadoresSolicitados: Array<{ trabajadorId: number; valor: number }> = esLote
    ? req.body.trabajadores.map((trabajador: { trabajadorId?: unknown; valor?: unknown } | null) => ({
        trabajadorId: Number(trabajador?.trabajadorId),
        valor: parseValorExacto(trabajador?.valor) ?? -1,
      }))
    : [{ trabajadorId: Number(req.body.trabajadorId), valor: parseValor(req.body.valor) }];
  const valorTotal = esLote ? parseValorExacto(req.body.valorTotal) : null;
  const resultado = await db.transaction(async (tx) => {
    const ya = await operacionYaProcesada(tx, operationId);
    if (ya) return { yaProcesado: ya } as const;
    if (!fecha) return { error: "La fecha es obligatoria", status: 400 } as const;
    if (
      trabajadoresSolicitados.length === 0 ||
      trabajadoresSolicitados.some(({ trabajadorId, valor }) => !Number.isInteger(trabajadorId) || valor < 0) ||
      new Set(trabajadoresSolicitados.map(({ trabajadorId }) => trabajadorId)).size !== trabajadoresSolicitados.length
    ) {
      return { error: "Selecciona trabajadores válidos sin duplicados", status: 400 } as const;
    }
    if (esLote && (valorTotal === null || valorTotal <= 0 ||
      Math.round(trabajadoresSolicitados.reduce((suma, trabajador) => suma + trabajador.valor, 0) * 100) !== Math.round(valorTotal * 100))) {
      return { error: "La suma asignada debe coincidir con el valor total de la obra", status: 400 } as const;
    }
    if (!esLote && trabajadoresSolicitados[0].valor <= 0) {
      return { error: "El valor debe ser mayor que cero", status: 400 } as const;
    }
    const ids = trabajadoresSolicitados.map(({ trabajadorId }) => trabajadorId);
    const trabajadores = await tx.select({
      id: trabajadoresTable.id,
      nombre: trabajadoresTable.nombre,
      obraElectronica: trabajadoresTable.obraElectronica,
    }).from(trabajadoresTable).where(inArray(trabajadoresTable.id, ids));
    if (trabajadores.length !== ids.length) return { error: "Uno o más empleados no fueron encontrados", status: 404 } as const;
    const trabajadoresPorId = new Map(trabajadores.map((trabajador) => [trabajador.id, trabajador]));
    if (trabajadores.some((trabajador) => !trabajador.obraElectronica)) {
      return { error: "Todos los empleados deben tener habilitada la obra electrónica", status: 403 } as const;
    }
    const valoresRegistros = trabajadoresSolicitados.flatMap(({ trabajadorId, valor }) => {
      const trabajador = trabajadoresPorId.get(trabajadorId);
      if (!trabajador) return [];
      return {
        trabajadorId: trabajador.id,
        empleadoNombre: trabajador.nombre,
        fecha,
        numeroFactura: String(numeroFactura || "").trim(),
        vehiculo: String(vehiculo || "").trim(),
        valor: String(valor),
      };
    });
    const registros = await tx.insert(obraElectronicaTable).values(valoresRegistros).returning();
    if (!req.header("x-sync-apply")) await tx.insert(eventosSincronizacionTable).values({ operationId, entidad: "obra_electronica", entidadId: String(registros[0].id), tipo: "crear", metodo: "POST", endpoint: "/obra-electronica", payload: req.body, origen: "local" });
    await tx.insert(operacionesSincronizadasTable).values({ operationId, tipo: "obra_electronica", recursoId: registros[0].id }).onConflictDoNothing();
    return { registros, esLote } as const;
  });
  if (resultado.yaProcesado) {
    res.status(200).json({ ok: true, yaProcesado: true, recursoId: resultado.yaProcesado.recursoId });
    return;
  }
  if (resultado.status !== undefined) { res.status(resultado.status).json({ error: resultado.error }); return; }
  res.status(201).json(resultado.esLote ? resultado.registros.map(mapRegistro) : mapRegistro(resultado.registros[0]));
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
