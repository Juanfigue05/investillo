import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { pool } from "@workspace/db";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

// ─── helpers ───────────────────────────────────────────────────────────────

function calcPrecioConIva(v: number): number {
  return Math.ceil((v * 1.19) / 1000) * 1000;
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
  cantidad: number | null; // null = no se especificó en la plantilla
}

function parseCantidad(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n =
    typeof raw === "number" ? raw : parseFloat(String(raw).replace(",", "."));
  return isNaN(n) ? null : n;
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
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });
  const dataRows = raw
    .slice(1)
    .filter((r) => Array.isArray(r) && cleanStr(r[0]) !== "");

  const rows: ParsedRow[] = [];
  const skipped: number[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i] as unknown[];
    const codigo = cleanStr(r[0]);
    const nombre = cleanStr(r[1]);
    if (!codigo || !nombre) {
      skipped.push(i + 2);
      continue;
    }

    const ref1 = cleanStr(r[2]);
    const ref2 = cleanStr(r[3]);
    const refParts = [ref1, ref2].filter((s) => s && s !== "0");
    const referencia = refParts.length ? refParts.join(" ").trim() : null;

    const marca = cleanStr(r[4]) || null;
    const pc = parsePrecio(r[5]);
    const pvs = parsePrecio(r[6]);
    const cantidad = parseCantidad(r[7]);

    rows.push({
      codigo,
      nombre,
      referencia,
      marca,
      precioCompra: String(pc),
      precioVentaSinIva: String(pvs),
      precioVentaConIva: String(calcPrecioConIva(pvs)),
      cantidad,
    });
  }
  return { rows, skipped };
}

interface ConflictoCantidad {
  codigo: string;
  nombre: string;
  stockActual: number;
  cantidadArchivo: number;
}

// Productos que no tienen código existente y esperan confirmación del usuario.
interface ProductoNuevo {
  codigo: string;
  nombre: string;
  referencia: string | null;
  marca: string | null;
  precioCompra: string;
  precioVentaSinIva: string;
  precioVentaConIva: string;
  cantidad: number | null;
}

async function upsertRows(
  items: ParsedRow[],
): Promise<{ conflictosCantidad: ConflictoCantidad[] }> {
  if (!items.length) return { conflictosCantidad: [] };

  const client = await pool.connect();
  try {
    // 1. Averiguar qué stock tiene HOY cada código que ya exista
    const codigos = items.map((x) => x.codigo);
    const existentes = await client.query(
      `SELECT codigo, stock_actual FROM productos WHERE codigo = ANY($1::text[])`,
      [codigos],
    );
    const stockPorCodigo = new Map<string, number>();
    for (const row of existentes.rows)
      stockPorCodigo.set(row.codigo, parseFloat(row.stock_actual));

    // 2. Decidir, fila por fila, qué stock final va a quedar guardado ahora mismo
    const conflictosCantidad: ConflictoCantidad[] = [];
    const cantidadFinal: string[] = [];

    for (const item of items) {
      const stockExistente = stockPorCodigo.get(item.codigo); // undefined = producto nuevo

      if (item.cantidad === null) {
        // No venía cantidad en la plantilla → no se toca el stock (o queda en 0 si es producto nuevo)
        cantidadFinal.push(String(stockExistente ?? 0));
      } else if (stockExistente === undefined || stockExistente === 0) {
        // Producto nuevo, o ya existía pero estaba en 0 → se asigna directo, sin preguntar
        cantidadFinal.push(String(item.cantidad));
      } else {
        // Ya tenía stock distinto de 0 → queda pendiente de que el usuario decida sumar o reemplazar
        conflictosCantidad.push({
          codigo: item.codigo,
          nombre: item.nombre,
          stockActual: stockExistente,
          cantidadArchivo: item.cantidad,
        });
        cantidadFinal.push(String(stockExistente)); // por ahora, se deja igual a como estaba
      }
    }

    const n = items.map((x) => x.nombre);
    const c = items.map((x) => x.codigo);
    const m = items.map((x) => x.marca);
    const r = items.map((x) => x.referencia);
    const pc = items.map((x) => x.precioCompra);
    const pvs = items.map((x) => x.precioVentaSinIva);
    const pvc = items.map((x) => x.precioVentaConIva);

    await client.query(
      `
      INSERT INTO productos
        (nombre, codigo, marca, tipo, referencia, adicional,
         precio_compra, precio_venta_sin_iva, precio_venta_con_iva,
         tiene_iva, stock_actual, stock_minimo)
      SELECT u.nombre, u.codigo, u.marca, NULL, u.referencia, NULL,
             u.pc::numeric, u.pvs::numeric, u.pvc::numeric,
             false, u.cantidad_final::numeric, '0'
      FROM UNNEST($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[])
           AS u(nombre,codigo,marca,referencia,pc,pvs,pvc,cantidad_final)
      ON CONFLICT (codigo) DO UPDATE SET
        nombre              = EXCLUDED.nombre,
        referencia          = EXCLUDED.referencia,
        marca               = EXCLUDED.marca,
        precio_compra       = EXCLUDED.precio_compra,
        precio_venta_sin_iva= EXCLUDED.precio_venta_sin_iva,
        precio_venta_con_iva= EXCLUDED.precio_venta_con_iva,
        stock_actual        = EXCLUDED.stock_actual,
        actualizado_en      = now()
    `,
      [n, c, m, r, pc, pvs, pvc, cantidadFinal],
    );

    return { conflictosCantidad };
  } finally {
    client.release();
  }
}

// ─── GET /template ──────────────────────────────────────────────────────────

router.get("/template", (_req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    [
      "CODIGO",
      "REFERENCIA",
      "REFERENCIA",
      "REFERENCIA 2",
      "MARCA",
      "SE COMPRA",
      "SE VENDE A",
      "CANTIDAD (opcional)",
    ],
  ]);
  ws["!cols"] = [16, 40, 30, 20, 20, 14, 14, 20].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, "Productos");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="plantilla_inventario.xlsx"',
  );
  res.send(buf);
});

// GET /export — exporta productos activos con la columna de cantidad vacía.
router.get("/export", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT codigo, nombre, referencia, marca, precio_compra,
             precio_venta_sin_iva, precio_venta_con_iva
      FROM productos
      WHERE activo = true
      ORDER BY nombre, codigo
    `);
    const wb = XLSX.utils.book_new();
    const rows = [
      [
        "CODIGO",
        "REFERENCIA",
        "REFERENCIA",
        "REFERENCIA 2",
        "MARCA",
        "SE COMPRA",
        "SE VENDE A",
        "CANTIDAD (opcional)",
      ],
      ...result.rows.map((p) => [
        p.codigo,
        p.nombre,
        p.referencia ?? "",
        "",
        p.marca ?? "",
        Number(p.precio_compra),
        Number(p.precio_venta_sin_iva),
        "",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [16, 40, 30, 20, 20, 14, 14, 20].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="inventario_productos.xlsx"',
    );
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
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
  if (!req.file) {
    res.status(400).json({ error: "No se recibió ningún archivo" });
    return;
  }

  try {
    const { rows, skipped } = parseExcel(req.file.buffer);
    if (!rows.length) {
      res.status(400).json({ error: "No se encontraron filas válidas" });
      return;
    }

    // Deduplicate: first occurrence wins for the import; later occurrences with
    // DIFFERENT data become "conflictos" returned to the client (max 500).
    const MAX_CONFLICTS = 500;
    const seen = new Map<string, ParsedRow>();
    const toImport: ParsedRow[] = [];
    const conflictos: {
      codigo: string;
      opcionA: ParsedRow;
      opcionB: ParsedRow;
    }[] = [];

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

    const codigos = toImport.map((item) => item.codigo);
    const existentes = await pool.query(
      `SELECT codigo FROM productos WHERE codigo = ANY($1::text[])`,
      [codigos],
    );
    const codigosExistentes = new Set(existentes.rows.map((row) => row.codigo));
    const productosNuevos: ProductoNuevo[] = toImport
      .filter((item) => !codigosExistentes.has(item.codigo))
      .map((item) => ({ ...item }));
    const filasExistentes = toImport.filter((item) =>
      codigosExistentes.has(item.codigo),
    );

    const { conflictosCantidad } = await upsertRows(filasExistentes);

    res.json({
      ok: true,
      total: rows.length,
      procesados: toImport.length,
      omitidos: skipped.length,
      conflictos: conflictos.length > 0 ? conflictos : undefined,
      conflictosCantidad:
        conflictosCantidad.length > 0 ? conflictosCantidad : undefined,
      productosNuevos: productosNuevos.length > 0 ? productosNuevos : undefined,
    });
  } catch (err: any) {
    console.error("Error importando Excel:", err?.message ?? err);
    res
      .status(500)
      .json({
        error: (err?.message ?? String(err)).split("\n")[0].substring(0, 400),
      });
  }
});

// POST /confirmar-nuevos — crea únicamente los productos aprobados por el usuario.
router.post("/confirmar-nuevos", async (req, res) => {
  try {
    const { items } = req.body as { items: ParsedRow[] };
    if (!Array.isArray(items) || !items.length) {
      res.status(400).json({ error: "items requerido" });
      return;
    }
    await upsertRows(items);
    res.json({ ok: true, procesados: items.length });
  } catch (err: any) {
    res
      .status(500)
      .json({
        error: (err?.message ?? String(err)).split("\n")[0].substring(0, 400),
      });
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
      res.status(400).json({ error: "items requerido" });
      return;
    }
    await upsertRows(items);
    res.json({ ok: true, procesados: items.length });
  } catch (err: any) {
    console.error("Error resolviendo conflictos:", err?.message ?? err);
    res
      .status(500)
      .json({
        error: (err?.message ?? String(err)).split("\n")[0].substring(0, 400),
      });
  }
});

// ─── POST /resolver-cantidades — aplica "sumar" o "reemplazar" a los conflictos de stock ──
router.post("/resolver-cantidades", async (req, res) => {
  try {
    const { modo, items } = req.body as {
      modo: "sumar" | "reemplazar";
      items: { codigo: string; cantidadArchivo: number }[];
    };
    if (!Array.isArray(items) || !items.length) {
      res.status(400).json({ error: "items requerido" });
      return;
    }

    const client = await pool.connect();
    try {
      for (const item of items) {
        if (modo === "sumar") {
          await client.query(
            `UPDATE productos SET stock_actual = stock_actual + $1::numeric, actualizado_en = now() WHERE codigo = $2`,
            [item.cantidadArchivo, item.codigo],
          );
        } else {
          await client.query(
            `UPDATE productos SET stock_actual = $1::numeric, actualizado_en = now() WHERE codigo = $2`,
            [item.cantidadArchivo, item.codigo],
          );
        }
      }
      res.json({ ok: true, procesados: items.length });
    } finally {
      client.release();
    }
  } catch (err: any) {
    res
      .status(500)
      .json({
        error: (err?.message ?? String(err)).split("\n")[0].substring(0, 400),
      });
  }
});

export default router;
