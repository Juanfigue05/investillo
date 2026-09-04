import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { pool } from "@workspace/db";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

function cleanStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v.toLocaleString("fullwide", { useGrouping: false });
  return String(v).trim();
}

function soloDigitos(v: string): string {
  return v.replace(/\D/g, "");
}

function parseTelefonos(raw: string): { telefono: string | null; telefono2: string | null } {
  if (!raw.trim()) return { telefono: null, telefono2: null };
  const partes = raw
    .split(/\s*[-/,]\s*|\s+y\s+|\s+Y\s+/)
    .map((p) => soloDigitos(p))
    .filter((p) => p.length >= 7);
  if (partes.length === 0) return { telefono: null, telefono2: null };
  return { telefono: partes[0] || null, telefono2: partes[1] || null };
}

interface ParsedCliente {
  nombre: string;
  telefono: string | null;
  telefono2: string | null;
  correo: string | null;
  notas: string | null;
}

interface ConflictoTelefono extends ParsedCliente {
  conflictoTelefono?: string; // cuál de los 2 números choca
  conflictoCon?: string;      // nombre del cliente (nuevo o existente) que ya lo tiene
}

function parseExcel(buffer: Buffer): { rows: ParsedCliente[]; omitidos: number[] } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  const dataRows = raw.slice(1);

  const rows: ParsedCliente[] = [];
  const omitidos: number[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i] as unknown[];
    const nombre = cleanStr(r[0]);
    if (!nombre) { omitidos.push(i + 2); continue; }

    const { telefono, telefono2 } = parseTelefonos(cleanStr(r[1]));
    rows.push({ nombre, telefono, telefono2, correo: cleanStr(r[2]) || null, notas: cleanStr(r[3]) || null });
  }
  return { rows, omitidos };
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

async function insertRows(items: ParsedCliente[]) {
  if (!items.length) return;
  const n = items.map((x) => x.nombre);
  const t = items.map((x) => x.telefono);
  const t2 = items.map((x) => x.telefono2);
  const c = items.map((x) => x.correo);
  const no = items.map((x) => x.notas);
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO clientes (nombre, telefono, telefono2, correo, notas)
       SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])`,
      [n, t, t2, c, no],
    );
  } finally {
    client.release();
  }
}

router.get("/template", (_req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([["NOMBRE", "TELEFONO (si son 2: 3145370182 - 3202501578)", "CORREO", "NOTAS"]]);
  ws["!cols"] = [30, 40, 30, 40].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, "Clientes");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="plantilla_clientes.xlsx"');
  res.send(buf);
});

router.post("/", upload.single("archivo"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No se recibió ningún archivo" }); return; }
  try {
    const { rows, omitidos } = parseExcel(req.file.buffer);
    if (!rows.length) { res.status(400).json({ error: "No se encontraron filas válidas (falta NOMBRE)" }); return; }

    const { unicos, duplicadosArchivo } = dedupeDentroDelArchivo(rows);
    const { nuevos, duplicadosBD } = await filtrarExistentesEnBD(unicos);
    const { validos, conflictos } = await separarConflictosDeTelefono(nuevos);

    await insertRows(validos);

    res.json({
      ok: true,
      total: rows.length + omitidos.length,
      procesados: validos.length,
      omitidos: omitidos.length,
      duplicados: duplicadosArchivo + duplicadosBD,
      conflictosTelefono: conflictos.length > 0 ? conflictos : undefined,
    });
  } catch (err: any) {
    console.error("Error importando clientes:", err?.message ?? err);
    res.status(500).json({ error: (err?.message ?? String(err)).split("\n")[0].substring(0, 400) });
  }
});

// ─── POST /resolver-telefonos — aplica lo que el usuario decidió para cada conflicto ──
router.post("/resolver-telefonos", async (req, res) => {
  try {
    const { items } = req.body as { items: ParsedCliente[] }; // ya vienen editados/decididos desde el frontend
    if (!Array.isArray(items)) { res.status(400).json({ error: "items requerido" }); return; }
    if (items.length === 0) { res.json({ ok: true, procesados: 0 }); return; }

    // Vuelve a revisar por si el usuario dejó, sin querer, otro número ya repetido
    const { validos, conflictos } = await separarConflictosDeTelefono(items);
    await insertRows(validos);

    res.json({
      ok: true,
      procesados: validos.length,
      conflictosTelefono: conflictos.length > 0 ? conflictos : undefined,
    });
  } catch (err: any) {
    res.status(500).json({ error: (err?.message ?? String(err)).split("\n")[0].substring(0, 400) });
  }
});

export default router;