import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { productosTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function calcPrecioConIva(precioSinIva: number): number {
  const conIva = precioSinIva * 1.19;
  return Math.ceil(conIva / 1000) * 1000;
}

/** Parse a price cell that may look like "$1,234", "1234", "$1.234,56", etc. */
function parsePrecio(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (!raw) return 0;
  const str = String(raw).replace(/[$\s]/g, "").replace(/,/g, "");
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function cleanStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

router.post("/", upload.single("archivo"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No se recibió ningún archivo" });
    return;
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert to array of arrays (raw values)
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

    // Skip header row (index 0)
    const dataRows = rows.slice(1).filter((row) => row && row.length > 0);

    // Column mapping:
    // A(0)=codigo  B(1)=nombre  C(2)=ref1  D(3)=ref2  E(4)=marca  F(5)=precioCompra  G(6)=precioVentaSinIva
    const items: (typeof productosTable.$inferInsert)[] = [];
    const skipped: number[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const codigo = cleanStr(row[0]);
      if (!codigo) {
        skipped.push(i + 2); // +2 because 1-based and we skipped header
        continue;
      }

      const nombre = cleanStr(row[1]);
      if (!nombre) {
        skipped.push(i + 2);
        continue;
      }

      const ref1 = cleanStr(row[2]);
      const ref2 = cleanStr(row[3]);
      const referencia = [ref1, ref2].filter(Boolean).join(" ").trim() || null;

      const marca = cleanStr(row[4]) || null;
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

    // Batch upsert in chunks of 500 to avoid query size limits
    const CHUNK = 500;
    let insertados = 0;
    let actualizados = 0;

    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      const result = await db
        .insert(productosTable)
        .values(chunk)
        .onConflictDoUpdate({
          target: productosTable.codigo,
          set: {
            nombre: sql`excluded.nombre`,
            referencia: sql`excluded.referencia`,
            marca: sql`excluded.marca`,
            precioCompra: sql`excluded.precio_compra`,
            precioVentaSinIva: sql`excluded.precio_venta_sin_iva`,
            precioVentaConIva: sql`excluded.precio_venta_con_iva`,
            actualizadoEn: new Date(),
          },
        })
        .returning({ id: productosTable.id, codigo: productosTable.codigo });

      // Drizzle doesn't distinguish insert vs update on conflict easily,
      // so we track totals by chunk size
      insertados += result.length;
    }

    res.json({
      ok: true,
      total: items.length,
      procesados: insertados,
      omitidos: skipped.length,
      filasOmitidas: skipped.slice(0, 20),
    });
  } catch (err) {
    console.error("Error importando Excel:", err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
