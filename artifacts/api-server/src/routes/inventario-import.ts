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

// ═══════════════════════════════════════════════════════════════════════════
// FLUJO NUEVO: exportar/importar TODOS los campos, con vista previa de cambios
// ═══════════════════════════════════════════════════════════════════════════

const COLUMNAS_COMPLETAS = [
  "CODIGO", "NOMBRE", "MARCA", "TIPO", "REFERENCIA", "ADICIONAL",
  "PRECIO COMPRA", "PRECIO VENTA (SIN IVA)", "APLICA IVA (SI/NO)",
  "STOCK LOCAL", "STOCK BODEGA", "STOCK MINIMO",
  "PRECIO VENTA CON IVA (solo referencia, no se actualiza)",
];
const ANCHOS_COMPLETOS = [16, 35, 18, 16, 25, 30, 14, 16, 14, 12, 12, 14, 18];

interface FilaCompleta {
  codigo: string;
  nombre: string | null;
  marca: string | null;
  tipo: string | null;
  referencia: string | null;
  adicional: string | null;
  precioCompra: number | null;
  precioVentaSinIva: number | null;
  tieneIva: boolean | null;
  stockLocal: number | null;
  stockBodega: number | null;
  stockMinimo: number | null;
}

function parseTextoOpcional(v: unknown): string | null {
  const s = cleanStr(v);
  return s === "" ? null : s;
}
function parseNumeroOpcional(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$\s,]/g, ""));
  return isNaN(n) ? null : n;
}
function parseSiNoOpcional(v: unknown): boolean | null {
  const s = cleanStr(v).toUpperCase();
  if (s === "") return null;
  return s === "SI" || s === "SÍ" || s === "S" || s === "1" || s === "TRUE";
}

function parseExcelCompleto(buffer: Buffer): FilaCompleta[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  const dataRows = raw.slice(1).filter((r) => Array.isArray(r) && cleanStr(r[0]) !== "");

  return dataRows.map((r) => ({
    codigo: cleanStr(r[0]),
    nombre: parseTextoOpcional(r[1]),
    marca: parseTextoOpcional(r[2]),
    tipo: parseTextoOpcional(r[3]),
    referencia: parseTextoOpcional(r[4]),
    adicional: parseTextoOpcional(r[5]),
    precioCompra: parseNumeroOpcional(r[6]),
    precioVentaSinIva: parseNumeroOpcional(r[7]),
    tieneIva: parseSiNoOpcional(r[8]),
    stockLocal: parseNumeroOpcional(r[9]),
    stockBodega: parseNumeroOpcional(r[10]),
    stockMinimo: parseNumeroOpcional(r[11]),
  }));
}

// ─── GET /template-completa — plantilla con TODOS los campos ──
router.get("/template-completa", (_req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([COLUMNAS_COMPLETAS]);
  ws["!cols"] = ANCHOS_COMPLETOS.map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, "Productos");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="plantilla_inventario_completa.xlsx"');
  res.send(buf);
});

// ─── GET /exportar-completo — TODOS los productos, TODOS los campos ──
router.get("/exportar-completo", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT codigo, nombre, marca, tipo, referencia, adicional,
             precio_compra, precio_venta_sin_iva, precio_venta_con_iva, tiene_iva,
             stock_local, stock_bodega, stock_minimo
      FROM productos
      ORDER BY nombre, codigo
    `);
    const wb = XLSX.utils.book_new();
    const rows = [
      COLUMNAS_COMPLETAS,
      ...result.rows.map((p) => [
        p.codigo, p.nombre ?? "", p.marca ?? "", p.tipo ?? "", p.referencia ?? "", p.adicional ?? "",
        Number(p.precio_compra), Number(p.precio_venta_sin_iva), p.tiene_iva ? "SI" : "NO",
        Number(p.stock_local ?? 0), Number(p.stock_bodega ?? 0), Number(p.stock_minimo),
        Number(p.precio_venta_con_iva),
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = ANCHOS_COMPLETOS.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="inventario_completo.xlsx"');
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

// ─── POST /previsualizar — compara el Excel contra la base de datos, NO aplica nada ──
router.post("/previsualizar", upload.single("archivo"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No se recibió ningún archivo" }); return; }

  try {
    const filas = parseExcelCompleto(req.file.buffer);
    if (!filas.length) { res.status(400).json({ error: "No se encontraron filas válidas" }); return; }

    const codigos = filas.map((f) => f.codigo);
    const existentes = await pool.query(
      `SELECT codigo, nombre, marca, tipo, referencia, adicional,
              precio_compra, precio_venta_sin_iva, tiene_iva,
              stock_local, stock_bodega, stock_minimo
       FROM productos WHERE codigo = ANY($1::text[])`,
      [codigos],
    );
    const porCodigo = new Map(existentes.rows.map((r) => [r.codigo, r]));

    const CAMPOS: { key: keyof FilaCompleta; label: string; tipo: "texto" | "numero" | "bool" }[] = [
      { key: "nombre", label: "Nombre", tipo: "texto" },
      { key: "marca", label: "Marca", tipo: "texto" },
      { key: "tipo", label: "Tipo", tipo: "texto" },
      { key: "referencia", label: "Referencia", tipo: "texto" },
      { key: "adicional", label: "Adicional", tipo: "texto" },
      { key: "precioCompra", label: "Precio Compra", tipo: "numero" },
      { key: "precioVentaSinIva", label: "Precio Venta (sin IVA)", tipo: "numero" },
      { key: "tieneIva", label: "Aplica IVA", tipo: "bool" },
      { key: "stockLocal", label: "Stock Local", tipo: "numero" },
      { key: "stockBodega", label: "Stock Bodega", tipo: "numero" },
      { key: "stockMinimo", label: "Stock Mínimo", tipo: "numero" },
    ];

    const mapaColumnaDb: Record<string, string> = {
      nombre: "nombre", marca: "marca", tipo: "tipo", referencia: "referencia", adicional: "adicional",
      precioCompra: "precio_compra", precioVentaSinIva: "precio_venta_sin_iva", tieneIva: "tiene_iva",
      stockLocal: "stock_local", stockBodega: "stock_bodega", stockMinimo: "stock_minimo",
    };

    const cambios: any[] = [];
    const omitidosSinNombre: string[] = [];
    const filasParaAplicar: FilaCompleta[] = [];

    for (const fila of filas) {
      const existente = porCodigo.get(fila.codigo);
      const esNuevo = !existente;

      if (esNuevo && !fila.nombre) {
        omitidosSinNombre.push(fila.codigo);
        continue;
      }

      const diffs: { campo: string; actual: string; nuevo: string }[] = [];

      if (!esNuevo) {
        for (const c of CAMPOS) {
          const nuevoValor = fila[c.key];
          if (nuevoValor === null) continue; // celda vacía = no tocar
          const actualRaw = existente[mapaColumnaDb[c.key]];

          let cambio = false;
          let actualTexto = "";
          let nuevoTexto = "";

          if (c.tipo === "numero") {
            const actualNum = parseFloat(actualRaw ?? "0");
            cambio = Math.abs(actualNum - (nuevoValor as number)) > 0.001;
            actualTexto = String(actualNum);
            nuevoTexto = String(nuevoValor);
          } else if (c.tipo === "bool") {
            const actualBool = Boolean(actualRaw);
            cambio = actualBool !== (nuevoValor as boolean);
            actualTexto = actualBool ? "SI" : "NO";
            nuevoTexto = (nuevoValor as boolean) ? "SI" : "NO";
          } else {
            const actualStr = (actualRaw ?? "").toString().trim();
            const nuevoStr = (nuevoValor as string).trim();
            cambio = actualStr !== nuevoStr;
            actualTexto = actualStr || "(vacío)";
            nuevoTexto = nuevoStr || "(vacío)";
          }

          if (cambio) diffs.push({ campo: c.label, actual: actualTexto, nuevo: nuevoTexto });
        }
      }

      if (esNuevo || diffs.length > 0) {
        cambios.push({
          codigo: fila.codigo,
          nombre: fila.nombre || existente?.nombre,
          esNuevo,
          cambios: diffs,
        });
        filasParaAplicar.push(fila);
      }
    }

    res.json({
      ok: true,
      totalEnArchivo: filas.length,
      sinCambios: filas.length - cambios.length - omitidosSinNombre.length,
      omitidosSinNombre: omitidosSinNombre.length,
      cambios,
      filasParaAplicar, // el frontend guarda esto y lo reenvía tal cual al confirmar
    });
  } catch (err: any) {
    console.error("Error previsualizando:", err?.message ?? err);
    res.status(500).json({ error: (err?.message ?? String(err)).split("\n")[0].substring(0, 400) });
  }
});

// ─── POST /aplicar-completo — aplica SOLO las filas que el usuario confirmó ──
router.post("/aplicar-completo", async (req, res) => {
  try {
    const { filas } = req.body as { filas: FilaCompleta[] };
    if (!Array.isArray(filas) || !filas.length) { res.status(400).json({ error: "filas requerido" }); return; }

    const codigos = filas.map((f) => f.codigo);
    const existentes = await pool.query(`SELECT codigo FROM productos WHERE codigo = ANY($1::text[])`, [codigos]);
    const codigosExistentes = new Set(existentes.rows.map((r) => r.codigo));

    const nuevas = filas.filter((f) => !codigosExistentes.has(f.codigo));
    const existentesFilas = filas.filter((f) => codigosExistentes.has(f.codigo));

    const client = await pool.connect();
    try {
      // 1. Actualizar existentes — COALESCE deja intacto lo que venía en null (celda vacía)
      if (existentesFilas.length) {
        const codigo = existentesFilas.map((f) => f.codigo);
        const nombre = existentesFilas.map((f) => f.nombre);
        const marca = existentesFilas.map((f) => f.marca);
        const tipo = existentesFilas.map((f) => f.tipo);
        const referencia = existentesFilas.map((f) => f.referencia);
        const adicional = existentesFilas.map((f) => f.adicional);
        const precioCompra = existentesFilas.map((f) => f.precioCompra);
        const precioVentaSinIva = existentesFilas.map((f) => f.precioVentaSinIva);
        const tieneIva = existentesFilas.map((f) => (f.tieneIva === null ? null : f.tieneIva));
        const stockLocal = existentesFilas.map((f) => f.stockLocal);
        const stockBodega = existentesFilas.map((f) => f.stockBodega);
        const stockMinimo = existentesFilas.map((f) => f.stockMinimo);

        await client.query(
          `
          UPDATE productos AS p SET
            nombre               = COALESCE(u.nombre, p.nombre),
            marca                = COALESCE(u.marca, p.marca),
            tipo                 = COALESCE(u.tipo, p.tipo),
            referencia           = COALESCE(u.referencia, p.referencia),
            adicional            = COALESCE(u.adicional, p.adicional),
            precio_compra        = COALESCE(u.precio_compra, p.precio_compra),
            precio_venta_sin_iva = COALESCE(u.precio_venta_sin_iva, p.precio_venta_sin_iva),
            precio_venta_con_iva = CEIL(COALESCE(u.precio_venta_sin_iva, p.precio_venta_sin_iva) * 1.19 / 1000) * 1000,
            tiene_iva            = COALESCE(u.tiene_iva, p.tiene_iva),
            stock_local          = COALESCE(u.stock_local, p.stock_local),
            stock_bodega         = COALESCE(u.stock_bodega, p.stock_bodega),
            stock_actual         = COALESCE(u.stock_local, p.stock_local) + COALESCE(u.stock_bodega, p.stock_bodega),
            stock_minimo         = COALESCE(u.stock_minimo, p.stock_minimo),
            actualizado_en       = now()
          FROM UNNEST(
            $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
            $7::numeric[], $8::numeric[], $9::boolean[], $10::numeric[], $11::numeric[], $12::numeric[]
          ) AS u(codigo, nombre, marca, tipo, referencia, adicional, precio_compra, precio_venta_sin_iva, tiene_iva, stock_local, stock_bodega, stock_minimo)
          WHERE p.codigo = u.codigo
          `,
          [codigo, nombre, marca, tipo, referencia, adicional, precioCompra, precioVentaSinIva, tieneIva, stockLocal, stockBodega, stockMinimo],
        );
      }

      // 2. Insertar los nuevos — celdas vacías quedan en 0 / null por defecto
      if (nuevas.length) {
        const codigo = nuevas.map((f) => f.codigo);
        const nombre = nuevas.map((f) => f.nombre);
        const marca = nuevas.map((f) => f.marca);
        const tipo = nuevas.map((f) => f.tipo);
        const referencia = nuevas.map((f) => f.referencia);
        const adicional = nuevas.map((f) => f.adicional);
        const precioCompra = nuevas.map((f) => f.precioCompra ?? 0);
        const precioVentaSinIva = nuevas.map((f) => f.precioVentaSinIva ?? 0);
        const tieneIva = nuevas.map((f) => Boolean(f.tieneIva));
        const stockLocal = nuevas.map((f) => f.stockLocal ?? 0);
        const stockBodega = nuevas.map((f) => f.stockBodega ?? 0);
        const stockMinimo = nuevas.map((f) => f.stockMinimo ?? 0);

        await client.query(
          `
          INSERT INTO productos
            (codigo, nombre, marca, tipo, referencia, adicional,
             precio_compra, precio_venta_sin_iva, precio_venta_con_iva, tiene_iva,
             stock_local, stock_bodega, stock_actual, stock_minimo)
          SELECT u.codigo, u.nombre, u.marca, u.tipo, u.referencia, u.adicional,
                 u.precio_compra, u.precio_venta_sin_iva,
                 CEIL(u.precio_venta_sin_iva * 1.19 / 1000) * 1000, u.tiene_iva,
                 u.stock_local, u.stock_bodega, u.stock_local + u.stock_bodega, u.stock_minimo
          FROM UNNEST(
            $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
            $7::numeric[], $8::numeric[], $9::boolean[], $10::numeric[], $11::numeric[], $12::numeric[]
          ) AS u(codigo, nombre, marca, tipo, referencia, adicional, precio_compra, precio_venta_sin_iva, tiene_iva, stock_local, stock_bodega, stock_minimo)
          `,
          [codigo, nombre, marca, tipo, referencia, adicional, precioCompra, precioVentaSinIva, tieneIva, stockLocal, stockBodega, stockMinimo],
        );
      }

      res.json({ ok: true, actualizados: existentesFilas.length, creados: nuevas.length });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("Error aplicando cambios:", err?.message ?? err);
    res.status(500).json({ error: (err?.message ?? String(err)).split("\n")[0].substring(0, 400) });
  }
});

export default router;
