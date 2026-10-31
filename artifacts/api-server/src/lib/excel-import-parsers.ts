import { parseNumeroColombia } from "@workspace/api-zod";
import { readExcelRows } from "./excel";

function cleanStr(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return value.toLocaleString("fullwide", { useGrouping: false });
  }
  return String(value).trim();
}

export interface ParsedRow {
  codigo: string;
  nombre: string;
  referencia: string | null;
  marca: string | null;
  precioCompra: string;
  precioVentaSinIva: string;
  precioVentaConIva: string;
  cantidad: number | null;
}

function calcPrecioConIva(value: number): number {
  return Math.ceil((value * 1.19) / 1000) * 1000;
}

function parsePrecio(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  return parseNumeroColombia(raw);
}

function parseCantidad(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const value =
    typeof raw === "number" ? raw : parseFloat(String(raw).replace(",", "."));
  return Number.isNaN(value) ? null : value;
}

export async function parseInventarioBasico(
  buffer: Buffer,
): Promise<{ rows: ParsedRow[]; skipped: number[] }> {
  const raw = await readExcelRows(buffer, 10_000, 8);
  const dataRows = raw
    .slice(1)
    .filter((row) => Array.isArray(row) && cleanStr(row[0]) !== "");

  const rows: ParsedRow[] = [];
  const skipped: number[] = [];

  for (let index = 0; index < dataRows.length; index++) {
    const row = dataRows[index];
    const codigo = cleanStr(row[0]);
    const nombre = cleanStr(row[1]);
    if (!codigo || !nombre) {
      skipped.push(index + 2);
      continue;
    }

    const ref1 = cleanStr(row[2]);
    const ref2 = cleanStr(row[3]);
    const refParts = [ref1, ref2].filter((part) => part && part !== "0");
    const referencia = refParts.length ? refParts.join(" ").trim() : null;
    const marca = cleanStr(row[4]) || null;
    const precioVentaSinIva = parsePrecio(row[6]);

    rows.push({
      codigo,
      nombre,
      referencia,
      marca,
      precioCompra: String(parsePrecio(row[5])),
      precioVentaSinIva: String(precioVentaSinIva),
      precioVentaConIva: String(calcPrecioConIva(precioVentaSinIva)),
      cantidad: parseCantidad(row[7]),
    });
  }

  return { rows, skipped };
}

export interface FilaCompleta {
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

function parseTextoOpcional(value: unknown): string | null {
  const text = cleanStr(value);
  return text === "" ? null : text;
}

function parseNumeroOpcional(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number =
    typeof value === "number"
      ? value
      : parseFloat(String(value).replace(/[$\s,]/g, ""));
  return Number.isNaN(number) ? null : number;
}

function parseSiNoOpcional(value: unknown): boolean | null {
  const text = cleanStr(value).toUpperCase();
  if (text === "") return null;
  return ["SI", "SÍ", "S", "1", "TRUE"].includes(text);
}

export async function parseInventarioCompleto(
  buffer: Buffer,
): Promise<FilaCompleta[]> {
  const raw = await readExcelRows(buffer, 10_000, 13);
  return raw
    .slice(1)
    .filter((row) => Array.isArray(row) && cleanStr(row[0]) !== "")
    .map((row) => ({
      codigo: cleanStr(row[0]),
      nombre: parseTextoOpcional(row[1]),
      marca: parseTextoOpcional(row[2]),
      tipo: parseTextoOpcional(row[3]),
      referencia: parseTextoOpcional(row[4]),
      adicional: parseTextoOpcional(row[5]),
      precioCompra: parseNumeroOpcional(row[6]),
      precioVentaSinIva: parseNumeroOpcional(row[7]),
      tieneIva: parseSiNoOpcional(row[8]),
      stockLocal: parseNumeroOpcional(row[9]),
      stockBodega: parseNumeroOpcional(row[10]),
      stockMinimo: parseNumeroOpcional(row[11]),
    }));
}

export interface ParsedCliente {
  nombre: string;
  telefono: string | null;
  telefono2: string | null;
  correo: string | null;
  notas: string | null;
}

function soloDigitos(value: string): string {
  return value.replace(/\D/g, "");
}

function parseTelefonos(raw: string): {
  telefono: string | null;
  telefono2: string | null;
} {
  if (!raw.trim()) return { telefono: null, telefono2: null };
  const partes = raw
    .split(/\s*[-/,]\s*|\s+y\s+|\s+Y\s+/)
    .map((part) => soloDigitos(part))
    .filter((part) => part.length >= 7);
  if (partes.length === 0) return { telefono: null, telefono2: null };
  return { telefono: partes[0] || null, telefono2: partes[1] || null };
}

export async function parseClientesExcel(
  buffer: Buffer,
): Promise<{ rows: ParsedCliente[]; omitidos: number[] }> {
  const raw = await readExcelRows(buffer, 10_000, 4);
  const dataRows = raw.slice(1);
  const rows: ParsedCliente[] = [];
  const omitidos: number[] = [];

  for (let index = 0; index < dataRows.length; index++) {
    const row = dataRows[index];
    const nombre = cleanStr(row[0]);
    if (!nombre) {
      omitidos.push(index + 2);
      continue;
    }

    const { telefono, telefono2 } = parseTelefonos(cleanStr(row[1]));
    rows.push({
      nombre,
      telefono,
      telefono2,
      correo: cleanStr(row[2]) || null,
      notas: cleanStr(row[3]) || null,
    });
  }
  return { rows, omitidos };
}
