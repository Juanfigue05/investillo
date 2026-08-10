import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { pool } from "@workspace/db";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

function calcPrecioConIva(precioSinIva: number): number {
  const conIva = precioSinIva * 1.19;
  return Math.ceil(conIva / 1000) * 1000;
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

// ---------------------------------------------------------------------------
// GET /api/inventario-import/template — download a blank Excel template
// ---------------------------------------------------------------------------
router.get("/template", (_req, res) => {
  const wb = XLSX.utils.book_new();
  const headers = ["CODIGO", "REFERENCIA", "REFERENCIA", "REFERENCIA 2", "MARCA", "SE COMPRA", "SE VENDE A"];
  const ws = XLSX.utils.aoa_to_sheet([headers]);

  // Column widths
  ws["!cols"] = [16, 40, 30, 20, 20, 14, 14].map((w) => ({ wch: w }));

  XLSX.utils.book_append_sheet(wb, ws, "Productos");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="plantilla_inventario.xlsx"');
  res.send(buf);
});

// ---------------------------------------------------------------------------
// POST /api/inventario-import — import products from uploaded .xlsx
//
// Excel columns (row 1 = headers, data from row 2):
//   A(0) CODIGO · B(1) REFERENCIA(nombre) · C(2) REFERENCIA(ref1)
//   D(3) REFERENCIA 2(ref2) · E(4) MARCA · F(5) SE COMPRA · G(6) SE VENDE A
// ---------------------------------------------------------------------------
router.post("/", upload.single("archivo"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No se recibió ningún archivo" });
    return;
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // defval:"" → empty cells come back as "" not undefined; raw:true → numbers stay numeric
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });

    const dataRows = rows.slice(1).filter((r) => Array.isArray(r) && cleanStr(r[0]) !== "");

    // Build typed arrays for UNNEST batch upsert
    const codigos: string[] = [];
    const nombres: string[] = [];
    const referencias: (string | null)[] = [];
    const marcas: (string | null)[] = [];
    const preciosCompra: string[] = [];
    const preciosVentaSin: string[] = [];
    const preciosVentaCon: string[] = [];
    const skipped: number[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i] as unknown[];
      const codigo = cleanStr(row[0]);
      const nombre = cleanStr(row[1]);

      if (!codigo || !nombre) {
        skipped.push(i + 2);
        continue;
      }

      const ref1 = cleanStr(row[2]);
      const ref2 = cleanStr(row[3]);
      const refParts = [ref1, ref2].filter((s) => s && s !== "0");
      const referencia = refParts.length > 0 ? refParts.join(" ").trim() : null;

      const marca = cleanStr(row[4]) || null;
      const precioCompra = parsePrecio(row[5]);
      const precioVentaSinIva = parsePrecio(row[6]);
      const precioVentaConIva = calcPrecioConIva(precioVentaSinIva);

      codigos.push(codigo);
      nombres.push(nombre);
      referencias.push(referencia);
      marcas.push(marca);
      preciosCompra.push(String(precioCompra));
      preciosVentaSin.push(String(precioVentaSinIva));
      preciosVentaCon.push(String(precioVentaConIva));
    }

    if (codigos.length === 0) {
      res.status(400).json({ error: "No se encontraron filas válidas en el archivo" });
      return;
    }

    // Deduplicate by codigo — keep the LAST occurrence of each code so the most
    // recent row in the spreadsheet wins. PostgreSQL's ON CONFLICT DO UPDATE
    // cannot affect the same row twice in a single statement.
    const seen = new Map<string, number>(); // codigo → final index in arrays
    for (let i = 0; i < codigos.length; i++) seen.set(codigos[i], i);
    const idxs = Array.from(seen.values());

    const uNombres    = idxs.map((i) => nombres[i]);
    const uCodigos    = idxs.map((i) => codigos[i]);
    const uMarcas     = idxs.map((i) => marcas[i]);
    const uRefs       = idxs.map((i) => referencias[i]);
    const uCompra     = idxs.map((i) => preciosCompra[i]);
    const uVentaSin   = idxs.map((i) => preciosVentaSin[i]);
    const uVentaCon   = idxs.map((i) => preciosVentaCon[i]);

    const duplicados = codigos.length - idxs.length;

    // Single UNNEST-based upsert — PostgreSQL handles all rows in one round-trip
    // Uses pg pool directly to avoid any Drizzle ORM abstraction issues
    const client = await pool.connect();
    try {
      await client.query(`
        INSERT INTO productos
          (nombre, codigo, marca, tipo, referencia, adicional,
           precio_compra, precio_venta_sin_iva, precio_venta_con_iva,
           tiene_iva, stock_actual, stock_minimo)
        SELECT
          u.nombre, u.codigo, u.marca, NULL, u.referencia, NULL,
          u.precio_compra::numeric, u.precio_venta_sin_iva::numeric, u.precio_venta_con_iva::numeric,
          false, '0', '0'
        FROM UNNEST(
          $1::text[], $2::text[], $3::text[], $4::text[],
          $5::text[], $6::text[], $7::text[]
        ) AS u(nombre, codigo, marca, referencia,
               precio_compra, precio_venta_sin_iva, precio_venta_con_iva)
        ON CONFLICT (codigo) DO UPDATE SET
          nombre             = EXCLUDED.nombre,
          referencia         = EXCLUDED.referencia,
          marca              = EXCLUDED.marca,
          precio_compra      = EXCLUDED.precio_compra,
          precio_venta_sin_iva = EXCLUDED.precio_venta_sin_iva,
          precio_venta_con_iva = EXCLUDED.precio_venta_con_iva,
          actualizado_en     = now()
      `, [uNombres, uCodigos, uMarcas, uRefs, uCompra, uVentaSin, uVentaCon]);
    } finally {
      client.release();
    }

    res.json({
      ok: true,
      total: codigos.length,
      procesados: idxs.length,
      omitidos: skipped.length,
      duplicados,
      filasOmitidas: skipped.slice(0, 20),
    });
  } catch (err: any) {
    console.error("Error importando Excel:", err?.message ?? err);
    const msg = (err?.message ?? String(err)).split("\n")[0].substring(0, 400);
    res.status(500).json({ error: msg });
  }
});

export default router;
