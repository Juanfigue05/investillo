export function parseNumeroColombia(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (raw === null || raw === undefined) return 0;

  const texto = String(raw).trim().replace(/[$\s']/g, "");
  if (!texto) return 0;

  const tieneComa = texto.includes(",");
  if (tieneComa) {
    const normalizado = texto.replace(/\./g, "").replace(",", ".");
    const numero = Number(normalizado);
    return Number.isFinite(numero) ? numero : 0;
  }

  const puntos = texto.match(/\./g)?.length ?? 0;
  if (puntos === 0) {
    const numero = Number(texto);
    return Number.isFinite(numero) ? numero : 0;
  }

  const ultimoPunto = texto.lastIndexOf(".");
  const decimalesFinales = texto.length - ultimoPunto - 1;
  const normalizado = puntos === 1 && decimalesFinales === 2
    ? texto
    : texto.replace(/\./g, "");
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : 0;
}

export function formatNumeroColombia(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 2,
  }).format(value);
}

export function interpretarNumeroColombia(raw: unknown): {
  original: string;
  valor: number;
  formateado: string;
  requiereConfirmacion: boolean;
} {
  const original = String(raw ?? "").trim();
  const sinSimbolos = original.replace(/[$\s']/g, "");
  const puntos = sinSimbolos.match(/\./g)?.length ?? 0;
  const ultimoPunto = sinSimbolos.lastIndexOf(".");
  const decimalesFinales = ultimoPunto >= 0
    ? sinSimbolos.length - ultimoPunto - 1
    : 0;

  return {
    original,
    valor: parseNumeroColombia(raw),
    formateado: formatNumeroColombia(parseNumeroColombia(raw)),
    requiereConfirmacion: puntos === 1 && decimalesFinales === 3,
  };
}