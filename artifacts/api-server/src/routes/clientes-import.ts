import { Router, type IRouter } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { operacionesSincronizadasTable } from "@workspace/db/schema";
import { pool, db } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  parseClientesExcel,
  type ParsedCliente,
} from "../lib/excel-import-parsers";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, parts: 2 } });

function soloDigitos(v: string): string {
  return v.replace(/\D/g, "");
}

interface ConflictoTelefono extends ParsedCliente {
  conflictoTelefono?: string; // cuál de los 2 números choca
  conflictoCon?: string;      // nombre del cliente (nuevo o existente) que ya lo tiene
}

type ClienteImportado = { nombre: string; id: number };

function referenciasRespuestaClientes(clientes: ClienteImportado[]) {
  return clientes.map((cliente, index) => ({
    campo: `_syncClientes.${index}.id`,
    entidad: "cliente",
    valorLocal: String(cliente.id),
  }));
}

function dedupeDentroDelArchivo(rows: ParsedCliente[]): { unicos: ParsedCliente[]; duplicadosArchivo: number } {
  const vistos = new Set<string>();
  const unicos: ParsedCliente[] = [];
  let duplicadosArchivo = 0;
  for (const row of rows) {
    const key = row.nombre.toLowerCase();
    if (vistos.has(key)) { duplicadosArchivo++; continue; }
    vistos.add(key);
    unicos.push(row);
  }
  return { unicos, duplicadosArchivo };
}

async function filtrarExistentesEnBD(rows: ParsedCliente[]): Promise<{ nuevos: ParsedCliente[]; duplicadosBD: number }> {
  if (!rows.length) return { nuevos: [], duplicadosBD: 0 };
  const nombresLower = rows.map((r) => r.nombre.toLowerCase());
  const client = await pool.connect();
  try {
    const { rows: existentes } = await client.query<{ nombre_lower: string }>(
      `SELECT lower(nombre) AS nombre_lower FROM clientes WHERE lower(nombre) = ANY($1::text[])`,
      [nombresLower],
    );
    const existentesSet = new Set(existentes.map((e) => e.nombre_lower));
    const nuevos = rows.filter((r) => !existentesSet.has(r.nombre.toLowerCase()));
    return { nuevos, duplicadosBD: rows.length - nuevos.length };
  } finally {
    client.release();
  }
}

/** En vez de omitir en silencio, SEPARA los que tienen teléfono en conflicto — se importan aparte, luego de que decidas qué hacer con cada uno. */
async function separarConflictosDeTelefono(rows: ParsedCliente[]): Promise<{ validos: ParsedCliente[]; conflictos: ConflictoTelefono[] }> {
  if (!rows.length) return { validos: [], conflictos: [] };

  const client = await pool.connect();
  let telefonosEnBD: Map<string, string>; // dígitos -> nombre del cliente existente
  try {
    const { rows: existentes } = await client.query<{ nombre: string; telefono: string | null; telefono2: string | null }>(
      `SELECT nombre, telefono, telefono2 FROM clientes WHERE telefono IS NOT NULL OR telefono2 IS NOT NULL`,
    );
    telefonosEnBD = new Map();
    for (const e of existentes) {
      if (e.telefono) telefonosEnBD.set(soloDigitos(e.telefono), e.nombre);
      if (e.telefono2) telefonosEnBD.set(soloDigitos(e.telefono2), e.nombre);
    }
  } finally {
    client.release();
  }

  const vistosEnArchivo = new Map<string, string>(); // dígitos -> nombre de la fila anterior del mismo archivo
  const validos: ParsedCliente[] = [];
  const conflictos: ConflictoTelefono[] = [];

  for (const row of rows) {
    const d1 = row.telefono ? soloDigitos(row.telefono) : "";
    const d2 = row.telefono2 ? soloDigitos(row.telefono2) : "";
    const numeros = [d1, d2].filter(Boolean);

    let numeroEnConflicto: string | undefined;
    let conflictoCon: string | undefined;
    for (const n of numeros) {
      if (telefonosEnBD.has(n)) { numeroEnConflicto = n; conflictoCon = telefonosEnBD.get(n); break; }
      if (vistosEnArchivo.has(n)) { numeroEnConflicto = n; conflictoCon = vistosEnArchivo.get(n); break; }
    }

    if (numeroEnConflicto) {
      conflictos.push({ ...row, conflictoTelefono: numeroEnConflicto, conflictoCon });
    } else {
      numeros.forEach((n) => vistosEnArchivo.set(n, row.nombre));
      validos.push(row);
    }
  }

  return { validos, conflictos };
}

async function insertRows(
  items: ParsedCliente[],
  operationId: string,
  tipoEvento?: "importar" | "resolver",
): Promise<ClienteImportado[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const insertados: ClienteImportado[] = [];
    for (const item of items) {
      const resultado = await client.query<{ id: number }>(
        `INSERT INTO clientes (nombre, telefono, telefono2, correo, notas)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          item.nombre,
          item.telefono,
          item.telefono2,
          item.correo,
          item.notas,
        ],
      );
      const id = resultado.rows[0]?.id;
      if (id === undefined) {
        throw new Error("No se pudo obtener el ID de una fila importada");
      }
      insertados.push({ nombre: item.nombre, id });
    }
    if (tipoEvento !== undefined) {
      await client.query(
        `INSERT INTO eventos_sincronizacion
           (operation_id, entidad, entidad_id, tipo, metodo, endpoint, payload,
            referencias_respuesta, origen)
         VALUES ($1, 'clientes_import', $1, $2, 'POST',
                 '/clientes-import/sincronizar', $3::jsonb, $4::jsonb, 'local')`,
        [
          operationId,
          tipoEvento,
          JSON.stringify({ items }),
          JSON.stringify(referenciasRespuestaClientes(insertados)),
        ],
      );
    }
    await client.query(
      `INSERT INTO operaciones_sincronizadas (operation_id, tipo, recurso_id)
       VALUES ($1, 'clientes_import', NULL)
       ON CONFLICT (operation_id) DO NOTHING`,
      [operationId],
    );
    await client.query("COMMIT");
    return insertados;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("No se pudo revertir la importación de clientes:", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

router.get("/template", async (_req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Clientes");
  ws.addRow(["NOMBRE", "TELEFONO (si son 2: 3145370182 - 3202501578)", "CORREO", "NOTAS"]);
  [30, 40, 30, 40].forEach(
    (width, index) => (ws.getColumn(index + 1).width = width),
  );
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="plantilla_clientes.xlsx"');
  res.send(buf);
});

router.post("/", upload.single("archivo"), async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  if (!req.file) { res.status(400).json({ error: "No se recibió ningún archivo" }); return; }
  try {
    const { rows, omitidos } = await parseClientesExcel(req.file.buffer);
    if (!rows.length) { res.status(400).json({ error: "No se encontraron filas válidas (falta NOMBRE)" }); return; }

    const { unicos, duplicadosArchivo } = dedupeDentroDelArchivo(rows);
    const { nuevos, duplicadosBD } = await filtrarExistentesEnBD(unicos);
    const { validos, conflictos } = await separarConflictosDeTelefono(nuevos);

    const clientes = await insertRows(
      validos,
      operationId,
      req.header("x-sync-apply") ? undefined : "importar",
    );

    res.json({
      ok: true,
      total: rows.length + omitidos.length,
      procesados: validos.length,
      omitidos: omitidos.length,
      duplicados: duplicadosArchivo + duplicadosBD,
      conflictosTelefono: conflictos.length > 0 ? conflictos : undefined,
      ...(clientes.length > 0 ? { _syncClientes: clientes } : {}),
    });
  } catch (err: any) {
    console.error("Error importando clientes:", err?.message ?? err);
    res.status(500).json({ error: (err?.message ?? String(err)).split("\n")[0].substring(0, 400) });
  }
});

router.post("/sincronizar", async (req, res) => {
  const operationId = req.header("x-operation-id");
  if (!operationId) { res.status(400).json({ error: "x-operation-id es obligatorio" }); return; }
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.json({ ok: true, yaProcesado: true }); return; }
  const items = req.body?.items as ParsedCliente[];
  if (!Array.isArray(items)) { res.status(400).json({ error: "items requerido" }); return; }
  const clientes = await insertRows(items, operationId);
  res.json({
    ok: true,
    procesados: items.length,
    ...(clientes.length > 0 ? { _syncClientes: clientes } : {}),
  });
});

// ─── POST /resolver-telefonos — aplica lo que el usuario decidió para cada conflicto ──
router.post("/resolver-telefonos", async (req, res) => {
  const operationId = req.header("x-operation-id") ?? crypto.randomUUID();
  const [ya] = await db.select().from(operacionesSincronizadasTable).where(eq(operacionesSincronizadasTable.operationId, operationId));
  if (ya) { res.status(200).json({ ok: true, yaProcesado: true, recursoId: ya.recursoId }); return; }
  try {
    const { items } = req.body as { items: ParsedCliente[] }; // ya vienen editados/decididos desde el frontend
    if (!Array.isArray(items)) { res.status(400).json({ error: "items requerido" }); return; }
    if (items.length === 0) { res.json({ ok: true, procesados: 0 }); return; }

    // Vuelve a revisar por si el usuario dejó, sin querer, otro número ya repetido
    const { validos, conflictos } = await separarConflictosDeTelefono(items);
    const clientes = await insertRows(
      validos,
      operationId,
      req.header("x-sync-apply") ? undefined : "resolver",
    );

    res.json({
      ok: true,
      procesados: validos.length,
      conflictosTelefono: conflictos.length > 0 ? conflictos : undefined,
      ...(clientes.length > 0 ? { _syncClientes: clientes } : {}),
    });
  } catch (err: any) {
    res.status(500).json({ error: (err?.message ?? String(err)).split("\n")[0].substring(0, 400) });
  }
});

export default router;