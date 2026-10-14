const CONCEPTOS_MANO_OBRA = new Set([
  "mano de obra",
  "soldadura",
  "chispeada",
  "pulida",
]);

export function esLineaManoObra(
  productoNombre: string | null | undefined,
  productoId?: number | string | null,
): boolean {
  return (
    (productoId === undefined || productoId === null || productoId === "") &&
    CONCEPTOS_MANO_OBRA.has(productoNombre?.trim().toLowerCase() ?? "")
  );
}
