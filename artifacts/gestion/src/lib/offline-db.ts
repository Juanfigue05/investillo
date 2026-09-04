import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface OperacionPendiente {
  operationId: string;
  tipo: string;
  metodo: "POST" | "PUT" | "PATCH" | "DELETE";
  endpoint: string;
  payload: unknown;
  creadoEn: string;
  estado: "pendiente" | "sincronizado" | "error";
  ultimoError?: string;
  intentos?: number;
}

interface RespaldoImportado {
  backupId: string;
  importadoEn: string;
}

interface InvestilloOfflineDB extends DBSchema {
  "operaciones-pendientes": {
    key: string;
    value: OperacionPendiente;
    indexes: { "por-estado": string };
  };
  "respaldos-importados": {
    key: string;
    value: RespaldoImportado;
  };
}

const DB_NAME = "investillo-offline";
const DB_VERSION = 2;
let dbPromise: Promise<IDBPDatabase<InvestilloOfflineDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<InvestilloOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const ops = db.objectStoreNames.contains("operaciones-pendientes")
          ? undefined
          : db.createObjectStore("operaciones-pendientes", {
              keyPath: "operationId",
            });
        if (ops && !ops.indexNames.contains("por-estado")) {
          ops.createIndex("por-estado", "estado");
        }
        if (!db.objectStoreNames.contains("respaldos-importados")) {
          db.createObjectStore("respaldos-importados", { keyPath: "backupId" });
        }
      },
    });
  }
  return dbPromise;
}

/** Encola una operación (venta, crédito, etc.) para sincronizar después */
export async function encolarOperacion(
  op: Omit<OperacionPendiente, "operationId" | "creadoEn" | "estado">,
) {
  const db = await getDB();
  const operacion: OperacionPendiente = {
    ...op,
    operationId: crypto.randomUUID(),
    creadoEn: new Date().toISOString(),
    estado: "pendiente",
  };
  await db.put("operaciones-pendientes", operacion);
  return operacion;
}

export async function listarPendientes(): Promise<OperacionPendiente[]> {
  const db = await getDB();
  return db.getAllFromIndex(
    "operaciones-pendientes",
    "por-estado",
    "pendiente",
  );
}

export async function marcarSincronizada(operationId: string) {
  const db = await getDB();
  await db.delete("operaciones-pendientes", operationId);
}

export async function contarPendientes(): Promise<number> {
  return (await listarPendientes()).length;
}

// ── Copia local (exportar / importar) ───────────────────────────────────────

export async function exportarRespaldoLocal(): Promise<{
  blob: Blob;
  nombreArchivo: string;
}> {
  const db = await getDB();
  const operaciones = await db.getAll("operaciones-pendientes");

  const respaldo = {
    backupId: crypto.randomUUID(),
    creadoEn: new Date().toISOString(),
    version: 1 as const,
    operaciones,
  };

  const blob = new Blob([JSON.stringify(respaldo, null, 2)], {
    type: "application/json",
  });
  const fecha = new Date().toISOString().replace(/[:.]/g, "-");
  return { blob, nombreArchivo: `investillo_copia_local_${fecha}.json` };
}

export interface ResultadoImportacion {
  ok: boolean;
  mensaje: string;
  agregadas?: number;
  omitidasPorDuplicado?: number;
}

export async function importarRespaldoLocal(
  archivo: File,
): Promise<ResultadoImportacion> {
  let contenido: any;
  try {
    contenido = JSON.parse(await archivo.text());
  } catch {
    return {
      ok: false,
      mensaje:
        "El archivo no es una copia local válida (JSON corrupto o formato incorrecto).",
    };
  }

  if (!contenido?.backupId || !Array.isArray(contenido?.operaciones)) {
    return {
      ok: false,
      mensaje:
        "El archivo no tiene el formato esperado de una copia local de Investillo.",
    };
  }

  const db = await getDB();

  // ── Protección #1: este archivo completo ya se importó antes ──
  const yaImportado = await db.get("respaldos-importados", contenido.backupId);
  if (yaImportado) {
    return {
      ok: false,
      mensaje:
        "Este archivo de copia local ya fue importado anteriormente — no se volvió a aplicar, para evitar duplicar información en el inventario.",
    };
  }

  // ── Protección #2: cada operación individual, por si viene mezclada en otro archivo ──
  let agregadas = 0;
  let omitidasPorDuplicado = 0;
  const tx = db.transaction("operaciones-pendientes", "readwrite");
  for (const op of contenido.operaciones as OperacionPendiente[]) {
    if (!op?.operationId) continue;
    const existente = await tx.store.get(op.operationId);
    if (existente) {
      omitidasPorDuplicado++;
      continue;
    }
    await tx.store.put(op);
    agregadas++;
  }
  await tx.done;

  await db.put("respaldos-importados", {
    backupId: contenido.backupId,
    importadoEn: new Date().toISOString(),
  });

  return {
    ok: true,
    mensaje: `${agregadas} operación${agregadas === 1 ? "" : "es"} pendiente${agregadas === 1 ? "" : "s"} agregada${agregadas === 1 ? "" : "s"}${omitidasPorDuplicado ? `, ${omitidasPorDuplicado} ya existían y se omitieron` : ""}.`,
    agregadas,
    omitidasPorDuplicado,
  };
}

/** true = de verdad no hay red; false = el servidor respondió con un error real (no encolar, mostrar el error) */
export function esFalloDeRed(error: unknown): boolean {
  if (error && typeof error === "object" && (error as any).name === "ApiError")
    return false;
  return error instanceof TypeError || !navigator.onLine;
}

/** Lista las operaciones que fallaron por un error del servidor. */
export async function listarErrores(): Promise<OperacionPendiente[]> {
  const db = await getDB();
  return db.getAllFromIndex("operaciones-pendientes", "por-estado", "error");
}

/** Cuenta operaciones pendientes o con error que todavía no se sincronizaron. */
export async function contarNoSincronizadas(): Promise<number> {
  const db = await getDB();
  const pendientes = await db.getAllFromIndex(
    "operaciones-pendientes",
    "por-estado",
    "pendiente",
  );
  const errores = await db.getAllFromIndex(
    "operaciones-pendientes",
    "por-estado",
    "error",
  );
  return pendientes.length + errores.length;
}

/** Marca una operación como error y conserva el motivo para revisarlo. */
export async function marcarConError(operationId: string, mensaje: string) {
  const db = await getDB();
  const operacion = await db.get("operaciones-pendientes", operationId);
  if (!operacion) return;
  await db.put("operaciones-pendientes", {
    ...operacion,
    estado: "error",
    ultimoError: mensaje,
    intentos: (operacion.intentos ?? 0) + 1,
  });
}

/** Devuelve los errores al estado pendiente para permitir un nuevo intento. */
export async function reintentarErrores(): Promise<number> {
  const db = await getDB();
  const errores = await listarErrores();
  const tx = db.transaction("operaciones-pendientes", "readwrite");
  for (const operacion of errores) {
    await tx.store.put({
      ...operacion,
      estado: "pendiente",
      ultimoError: undefined,
    });
  }
  await tx.done;
  return errores.length;
}
