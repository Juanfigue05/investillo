import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | undefined | null) {
  if (value === undefined || value === null) return "$0";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
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

// Logic for calculating IVA rounding
export function calcularPrecioConIva(precioSinIva: number): number {
  const conIva = precioSinIva * 1.19;
  return Math.ceil(conIva / 1000) * 1000;
}
