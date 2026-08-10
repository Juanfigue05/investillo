import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { pool } from "@workspace/db";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

// ─── helpers ───────────────────────────────────────────────────────────────

function calcPrecioConIva(v: number): number {
  return Math.ceil(v * 1.19 / 1000) * 1000;
}

function parsePrecio(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return isNaN(raw) ? 0 : raw;
  const n = parseFloat(String(raw).replace(/[$\s,]/g, ""));
  return isNaN(n) ? 0 : n;
}

function cleanStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

interface ParsedRow {
  codigo: string;
  nombre: string;
  referencia: string | null;
  marca: string | null;
  precioCompra: string;
  precioVentaSinIva: string;
  precioVentaConIva: string;
}

function rowsEqual(a: ParsedRow, b: ParsedRow): boolean {
  return (
    a.nombre === b.nombre &&
    a.referencia === b.referencia &&
    a.marca === b.marca &&
    a.precioCompra === b.precioCompra &&
    a.precioVentaSinIva === b.precioVentaSinIva
  );
}

function parseExcel(buffer: Buffer): { rows: ParsedRow[]; skipped: number[] } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  const dataRows = raw.slice(1).filter((r) => Array.isArray(r) && cleanStr(r[0]) !== "");

  const rows: ParsedRow[] = [];
  const skipped: number[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i] as unknown[];
    const codigo = cleanStr(r[0]);
    const nombre = cleanStr(r[1]);
    if (!codigo || !nombre) { skipped.push(i + 2); continue; }

    const ref1 = cleanStr(r[2]);
    const ref2 = cleanStr(r[3]);
    const refParts = [ref1, ref2].filter((s) => s && s !== "0");
    const referencia = refParts.length ? refParts.join(" ").trim() : null;

    const marca = cleanStr(r[4]) || null;
    const pc = parsePrecio(r[5]);
    const pvs = parsePrecio(r[6]);

    rows.push({
      codigo,
      nombre,
      referencia,
      marca,
      precioCompra: String(pc),
      precioVentaSinIva: String(pvs),
      precioVentaConIva: String(calcPrecioConIva(pvs)),
    });
  }
  return { rows, skipped };
}

/** Run a bulk UPSERT via UNNEST — fast single round-trip */
async function upsertRows(items: ParsedRow[]) {
  if (!items.length) return;
  const n = items.map((x) => x.nombre);
  const c = items.map((x) => x.codigo);
  const m = items.map((x) => x.marca);
  const r = items.map((x) => x.referencia);
  const pc = items.map((x) => x.precioCompra);
  const pvs = items.map((x) => x.precioVentaSinIva);
  const pvc = items.map((x) => x.precioVentaConIva);

  const client = await pool.connect();
  try {
    await client.query(`
      INSERT INTO productos
        (nombre, codigo, marca, tipo, referencia, adicional,
         precio_compra, precio_venta_sin_iva, precio_venta_con_iva,
         tiene_iva, stock_actual, stock_minimo)
      SELECT u.nombre, u.codigo, u.marca, NULL, u.referencia, NULL,
             u.pc::numeric, u.pvs::numeric, u.pvc::numeric,
             false, '0', '0'
      FROM UNNEST($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[])
           AS u(nombre,codigo,marca,referencia,pc,pvs,pvc)
      ON CONFLICT (codigo) DO UPDATE SET
        nombre              = EXCLUDED.nombre,
        referencia          = EXCLUDED.referencia,
        marca               = EXCLUDED.marca,
        precio_compra       = EXCLUDED.precio_compra,
        precio_venta_sin_iva= EXCLUDED.precio_venta_sin_iva,
        precio_venta_con_iva= EXCLUDED.precio_venta_con_iva,
        actualizado_en      = now()
    `, [n, c, m, r, pc, pvs, pvc]);
  } finally {
    client.release();
  }
}

// ─── GET /template ──────────────────────────────────────────────────────────

router.get("/template", (_req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["CODIGO", "REFERENCIA", "REFERENCIA", "REFERENCIA 2", "MARCA", "SE COMPRA", "SE VENDE A"],
  ]);
  ws["!cols"] = [16, 40, 30, 20, 20, 14, 14].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, "Productos");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="plantilla_inventario.xlsx"');
  res.send(buf);
});

// ─── POST / — parse & import ────────────────────────────────────────────────
//
// Excel columns (row 1 = headers, data from row 2):
//   A(0) CODIGO · B(1) REFERENCIA(nombre) · C(2) REFERENCIA(ref1)
//   D(3) REFERENCIA 2 · E(4) MARCA · F(5) SE COMPRA · G(6) SE VENDE A
//
// Duplicate handling:
//   - Same codigo, same data  → import silently (idempotent)
//   - Same codigo, DIFFERENT data → hold aside as "conflictos" (max 500),
//     import first occurrence, return conflicts for user resolution
// ───────────────────────────────────────────────────────────────────────────

router.post("/", upload.single("archivo"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No se recibió ningún archivo" }); return; }

  try {
    const { rows, skipped } = parseExcel(req.file.buffer);
    if (!rows.length) { res.status(400).json({ error: "No se encontraron filas válidas" }); return; }

    // Deduplicate: first occurrence wins for the import; later occurrences with
    // DIFFERENT data become "conflictos" returned to the client (max 500).
    const MAX_CONFLICTS = 500;
    const seen = new Map<string, ParsedRow>();
    const toImport: ParsedRow[] = [];
    const conflictos: { codigo: string; opcionA: ParsedRow; opcionB: ParsedRow }[] = [];

    for (const row of rows) {
      if (!seen.has(row.codigo)) {
        seen.set(row.codigo, row);
        toImport.push(row);
      } else {
        const prev = seen.get(row.codigo)!;
        if (!rowsEqual(prev, row) && conflictos.length < MAX_CONFLICTS) {
          conflictos.push({ codigo: row.codigo, opcionA: prev, opcionB: row });
        }
        // identical duplicates → silently skip (already queued via `prev`)
      }
    }

    await upsertRows(toImport);

    res.json({
      ok: true,
      total: rows.length,
      procesados: toImport.length,
      omitidos: skipped.length,
      conflictos: conflictos.length > 0 ? conflictos : undefined,
    });
  } catch (err: any) {
    console.error("Error importando Excel:", err?.message ?? err);
    res.status(500).json({ error: (err?.message ?? String(err)).split("\n")[0].substring(0, 400) });
  }
});

// ─── POST /resolver — apply user-chosen conflict resolutions ────────────────
//
// Body: { items: ParsedRow[] }
// ───────────────────────────────────────────────────────────────────────────

router.post("/resolver", async (req, res) => {
  try {
    const { items } = req.body as { items: ParsedRow[] };
    if (!Array.isArray(items) || !items.length) {
      res.status(400).json({ error: "items requerido" }); return;
    }
    await upsertRows(items);
    res.json({ ok: true, procesados: items.length });
  } catch (err: any) {
    console.error("Error resolviendo conflictos:", err?.message ?? err);
    res.status(500).json({ error: (err?.message ?? String(err)).split("\n")[0].substring(0, 400) });
  }
});

export default router;
