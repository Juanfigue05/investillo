export function debeAjustarInventarioVenta(venta: {
  origen?: string | null;
  afectaInventario?: boolean | null;
}): boolean {
  return venta.origen !== "pago_credito_antiguo" && venta.afectaInventario !== false;
}
