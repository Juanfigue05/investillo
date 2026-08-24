import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { pool } from "@workspace/db";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

function cleanStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

interface ParsedCliente {
  nombre: string;
  telefono: string | null;
  correo: string | null;
  notas: string | null;
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

    rows.push({
      nombre,
      telefono: cleanStr(r[1]) || null,
      correo: cleanStr(r[2]) || null,
      notas: cleanStr(r[3]) || null,
    });
  }
  return { rows, omitidos };
}

/** Quita duplicados dentro del propio archivo (mismo nombre, sin distinguir mayúsc./espacios) */
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

/** Consulta cuáles de esos nombres ya existen en la base de datos */
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

async function insertRows(items: ParsedCliente[]) {
  if (!items.length) return;
  const n = items.map((x) => x.nombre);
  const t = items.map((x) => x.telefono);
  const c = items.map((x) => x.correo);
  const no = items.map((x) => x.notas);

  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO clientes (nombre, telefono, correo, notas)
       SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[])`,
      [n, t, c, no],
    );
  } finally {
    client.release();
  }
}

router.get("/template", (_req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([["NOMBRE", "TELEFONO", "CORREO", "NOTAS"]]);
  ws["!cols"] = [30, 18, 30, 40].map((w) => ({ wch: w }));
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

    await insertRows(nuevos);

    res.json({
      ok: true,
      total: rows.length + omitidos.length,
      procesados: nuevos.length,
      omitidos: omitidos.length,
      duplicados: duplicadosArchivo + duplicadosBD,
    });
  } catch (err: any) {
    console.error("Error importando clientes:", err?.message ?? err);
    res.status(500).json({ error: (err?.message ?? String(err)).split("\n")[0].substring(0, 400) });
  }
});

export default router;