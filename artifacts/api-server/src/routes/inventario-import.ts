import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { productosTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

function calcPrecioConIva(precioSinIva: number): number {
  const conIva = precioSinIva * 1.19;
  return Math.ceil(conIva / 1000) * 1000;
}

/** Safely parse a price cell — handles number, empty string, undefined */
function parsePrecio(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return isNaN(raw) ? 0 : raw;
  const n = parseFloat(String(raw).replace(/[$\s,]/g, "").replace(/\./g, ""));
  return isNaN(n) ? 0 : n;
}

function cleanStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  // "0" from a number cell that was empty → treat as empty
  return s === "0" ? s : s;
}

// ---------------------------------------------------------------------------
// POST /api/inventario-import
// Expects multipart/form-data with field "archivo" containing the .xlsx file.
//
// Excel column layout (row 1 = headers, data starts at row 2):
//   A(0) = CODIGO
//   B(1) = REFERENCIA (nombre / Producto)
//   C(2) = REFERENCIA (referencia parte 1)
//   D(3) = REFERENCIA 2 (referencia parte 2, concatenado con C)
//   E(4) = MARCA
//   F(5) = SE COMPRA  (precioCompra)
//   G(6) = SE VENDE A (precioVentaSinIva)
// ---------------------------------------------------------------------------
router.post("/", upload.single("archivo"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No se recibió ningún archivo" });
    return;
  }

  try {
    // Read workbook — raw:false gives us formatted strings but defval:"" fills blanks.
    // We use raw:true for numbers to keep numeric values as JS numbers, but defval:""
    // ensures empty cells don't come back as undefined.
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // header:1 → array of arrays; raw:true → numbers stay as numbers; defval:"" → no undefined
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: "",
    });

    // Row 0 = headers, data starts at row 1
    const dataRows = rows.slice(1).filter((row) => Array.isArray(row) && row.length >= 2);

    const items: (typeof productosTable.$inferInsert)[] = [];
    const skipped: number[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i] as unknown[];

      const codigo = cleanStr(row[0]);
      const nombre = cleanStr(row[1]);

      // Skip rows without code or product name
      if (!codigo || !nombre) {
        skipped.push(i + 2); // +2: 1-based + header offset
        continue;
      }

      const ref1 = cleanStr(row[2]);
      const ref2 = cleanStr(row[3]);
      // Combine ref columns; ignore "0" placeholders from empty numeric cells
      const refParts = [ref1, ref2].filter((s) => s && s !== "0");
      const referencia = refParts.length > 0 ? refParts.join(" ").trim() : null;

      // Marca: "X" is a valid brand mark; empty → null
      const marcaRaw = cleanStr(row[4]);
      const marca = marcaRaw || null;

      const precioCompra = parsePrecio(row[5]);
      const precioVentaSinIva = parsePrecio(row[6]);
      const precioVentaConIva = calcPrecioConIva(precioVentaSinIva);

      items.push({
        codigo,
        nombre,
        referencia,
        marca,
        tipo: null,
        adicional: null,
        precioCompra: String(precioCompra),
        precioVentaSinIva: String(precioVentaSinIva),
        precioVentaConIva: String(precioVentaConIva),
        tieneIva: false,
        stockActual: "0",
        stockMinimo: "0",
      });
    }

    if (items.length === 0) {
      res.status(400).json({ error: "No se encontraron filas válidas en el archivo" });
      return;
    }

    // Process in small chunks to keep queries manageable (~100 rows × 12 params = 1200 params)
    const CHUNK = 100;
    let procesados = 0;

    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);

      await db
        .insert(productosTable)
        .values(chunk)
        .onConflictDoUpdate({
          target: productosTable.codigo,
          set: {
            nombre:            sql`EXCLUDED.nombre`,
            referencia:        sql`EXCLUDED.referencia`,
            marca:             sql`EXCLUDED.marca`,
            precioCompra:      sql`EXCLUDED.precio_compra`,
            precioVentaSinIva: sql`EXCLUDED.precio_venta_sin_iva`,
            precioVentaConIva: sql`EXCLUDED.precio_venta_con_iva`,
            actualizadoEn:     sql`now()`,
          },
        });

      procesados += chunk.length;
    }

    res.json({
      ok: true,
      total: items.length,
      procesados,
      omitidos: skipped.length,
      filasOmitidas: skipped.slice(0, 20),
    });
  } catch (err: any) {
    // Log full error server-side for debugging
    console.error("Error importando Excel:", err?.message ?? err);
    if (err?.cause) console.error("Causa:", err.cause);

    // Return a useful but short error to the client
    const msg = err?.message
      ? err.message.split("\n")[0].substring(0, 300)
      : "Error desconocido";
    res.status(500).json({ error: msg });
  }
});

export default router;
