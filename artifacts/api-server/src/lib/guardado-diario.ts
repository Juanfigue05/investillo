import { db } from "@workspace/db";
import {
  cierreDiarioBorradoresTable,
  cierreDiarioTable,
  eventosSincronizacionTable,
  historialDiasTable,
  operacionesSincronizadasTable,
  trabajadoresTable,
  ventasDiariasTable,
} from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { fechaColombia } from "./fecha";
import { logger } from "./logger";
import { asegurarTablaBorradores, seguroPorTrabajador } from "../routes/cierre-diario";

const ZONA_HORARIA = "America/Bogota";
const INTERVALO_MS = 60_000;

function horaEnColombia(fecha: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(fecha);
  return Number(partes.find((parte) => parte.type === "hour")?.value);
}

function sincronizacionAutomatica(operationId: string) {
  const remota = process.env.SYNC_CAPTURE_REMOTE === "true";
  return {
    operationId,
    origen: remota ? "remoto" : "local",
    ...(remota ? { estado: "sincronizado", procesadoEn: new Date() } : {}),
  };
}

async function guardarCierreDelBorrador(fecha: string) {
  await asegurarTablaBorradores();
  const [borrador] = await db
    .select()
    .from(cierreDiarioBorradoresTable)
    .where(eq(cierreDiarioBorradoresTable.fecha, fecha))
    .limit(1);
  if (!borrador) return false;

  const datos = borrador.datos as {
    trabajadores?: Array<{ calc?: { total?: number } }>;
    totalPagar?: number;
  };
  if (!Array.isArray(datos.trabajadores) || datos.trabajadores.length === 0) {
    return false;
  }
  const totalCalculado = datos.trabajadores.reduce<number | null>(
    (total, trabajador) => {
      const calculado = trabajador.calc?.total;
      return total !== null &&
        typeof calculado === "number" &&
        Number.isFinite(calculado)
        ? total + calculado
        : null;
    },
    0,
  );
  const totalGuardado =
    typeof datos.totalPagar === "number"
      ? datos.totalPagar
      : totalCalculado;
  if (totalGuardado === null || !Number.isFinite(totalGuardado)) {
    logger.warn(
      { fecha },
      "No se guardó el cierre automático: borrador sin total calculado",
    );
    return false;
  }

  const operationId = `auto-cierre-${fecha}`;
  const payload = {
    fecha,
    datos,
    totalPagar: totalGuardado,
    editar: false,
  };
  const sync = sincronizacionAutomatica(operationId);
  return db.transaction(async (tx) => {
    const [existente] = await tx
      .select({ id: cierreDiarioTable.id })
      .from(cierreDiarioTable)
      .where(eq(cierreDiarioTable.fecha, fecha))
      .limit(1);
    if (existente) return false;

    const [creado] = await tx
      .insert(cierreDiarioTable)
      .values({ fecha, datos, totalPagar: totalGuardado })
      .onConflictDoNothing({ target: cierreDiarioTable.fecha })
      .returning({ id: cierreDiarioTable.id });
    if (!creado) return false;

    for (const [trabajadorId, valor] of seguroPorTrabajador(datos)) {
      await tx
        .update(trabajadoresTable)
        .set({
          totalSeguroDescontado: sql`${trabajadoresTable.totalSeguroDescontado} + ${valor}`,
        })
        .where(eq(trabajadoresTable.id, trabajadorId));
    }
    await tx
      .delete(cierreDiarioBorradoresTable)
      .where(eq(cierreDiarioBorradoresTable.fecha, fecha));

    await tx
      .insert(eventosSincronizacionTable)
      .values({
        ...sync,
        entidad: "cierre_diario",
        entidadId: String(creado.id),
        tipo: "guardar",
        metodo: "POST",
        endpoint: "/cierre-diario",
        payload,
      })
      .onConflictDoNothing();
    await tx
      .insert(operacionesSincronizadasTable)
      .values({
        operationId,
        tipo: "cierre_diario",
        recursoId: creado.id,
      })
      .onConflictDoNothing();
    return true;
  });
}

async function guardarVentasEnHistorial(fecha: string) {
  const [venta] = await db
    .select({ id: ventasDiariasTable.id })
    .from(ventasDiariasTable)
    .where(eq(ventasDiariasTable.fecha, fecha))
    .limit(1);
  if (!venta) return false;

  const operationId = `auto-historial-${fecha}`;
  const sync = sincronizacionAutomatica(operationId);
  return db.transaction(async (tx) => {
    const [dia] = await tx
      .insert(historialDiasTable)
      .values({ fecha })
      .onConflictDoNothing({ target: historialDiasTable.fecha })
      .returning({ id: historialDiasTable.id });
    if (!dia) return false;

    await tx
      .insert(eventosSincronizacionTable)
      .values({
        ...sync,
        entidad: "historial",
        entidadId: String(dia.id),
        tipo: "crear",
        metodo: "POST",
        endpoint: "/historial",
        payload: { fecha },
      })
      .onConflictDoNothing();
    await tx
      .insert(operacionesSincronizadasTable)
      .values({
        operationId,
        tipo: "historial",
        recursoId: dia.id,
      })
      .onConflictDoNothing();
    return true;
  });
}

export async function guardarDiarioSiCorresponde(now = new Date()) {
  if (horaEnColombia(now) < 20) return;

  const fecha = fechaColombia(now);
  const cierreGuardado = await guardarCierreDelBorrador(fecha);
  const ventasGuardadas = await guardarVentasEnHistorial(fecha);
  if (cierreGuardado || ventasGuardadas) {
    logger.info(
      { fecha, cierreGuardado, ventasGuardadas },
      "Guardado automático diario completado",
    );
  }
}

export function iniciarGuardadoDiario() {
  let ejecutando = false;
  const ejecutar = async () => {
    if (ejecutando) return;
    ejecutando = true;
    try {
      await guardarDiarioSiCorresponde();
    } catch (error) {
      logger.error({ err: error }, "Falló el guardado automático diario");
    } finally {
      ejecutando = false;
    }
  };

  void ejecutar();
  setInterval(() => void ejecutar(), INTERVALO_MS);
}
