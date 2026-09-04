import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fechaColombia(fecha: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

export function fechaHoyColombia(): string {
  return fechaColombia(new Date());
}

/** Calcula la fecha de vencimiento sumando días calendario a una fecha YYYY-MM-DD. */
export function sumarDiasFecha(fecha: string, dias: number): string {
  const resultado = new Date(`${fecha}T12:00:00`);
  resultado.setDate(resultado.getDate() + dias);
  return resultado.toISOString().slice(0, 10);
}

/** Devuelve los días completos de mora respecto a la fecha actual de Colombia. */
export function diasVencidos(
  fechaFactura: string,
  hoy: string = fechaHoyColombia(),
): number {
  const vencimiento = sumarDiasFecha(fechaFactura, 30);
  const diferencia =
    Date.parse(`${hoy}T12:00:00`) - Date.parse(`${vencimiento}T12:00:00`);
  return Math.max(0, Math.floor(diferencia / 86_400_000));
}

/** Describe una mora usando años, meses de 30 días y días restantes. */
export function formatearMora(dias: number): string {
  if (dias <= 0) return "Sin mora";
  const anos = Math.floor(dias / 360);
  const meses = Math.floor((dias % 360) / 30);
  const diasRestantes = dias % 30;
  const partes: string[] = [];
  if (anos) partes.push(`${anos} año${anos === 1 ? "" : "s"}`);
  if (meses) partes.push(`${meses} mes${meses === 1 ? "" : "es"}`);
  if (diasRestantes || partes.length === 0)
    partes.push(`${diasRestantes} día${diasRestantes === 1 ? "" : "s"}`);
  return partes.join(" y ");
}

export function formatCurrency(value: number | undefined | null) {
  if (value === undefined || value === null) return "$0";
  const negativo = value < 0;
  const entero = Math.round(Math.abs(value));
  let str = entero.toLocaleString("es-CO", { maximumFractionDigits: 0 }); // ej: "1.234.567"
  if (entero >= 1_000_000) {
    str = str.replace(".", "'"); // solo el primer punto (el de millones) se cambia por comilla
  }
  return `${negativo ? "-" : ""}$ ${str}`;
}

export function parseNumberCO(value: string): number {
  // Replaces dot (thousands) with nothing, and comma (decimals) with dot
  const clean = value.replace(/\./g, "").replace(/,/g, ".");
  return parseFloat(clean) || 0;
}

export function formatNumberCO(value: number): string {
  // Formats to string with comma for decimals and dots for thousands
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 2,
  }).format(value);
}

// Formats a phone number with spaces for readability: (310) 420 1761
export function formatTelefono(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

// Digits-only version, for phone search comparisons
export function soloDigitos(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}

// Logic for calculating IVA rounding
export function calcularPrecioConIva(precioSinIva: number): number {
  const conIva = precioSinIva * 1.19;
  return Math.ceil(conIva / 1000) * 1000;
}
