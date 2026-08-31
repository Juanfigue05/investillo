import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
