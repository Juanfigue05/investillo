export interface VentaOperativaDia {
  tipoLinea: string;
  precioVentaTotal: number | string;
}

export function resumirOperacionDiaria(
  ventas: readonly VentaOperativaDia[],
  egresosCompras: number,
  manoObraPorPagar: number,
) {
  const ventasProductos = ventas
    .filter((venta) => venta.tipoLinea === "venta")
    .reduce((total, venta) => total + (Number(venta.precioVentaTotal) || 0), 0);
  const abonosCredito = ventas
    .filter((venta) => venta.tipoLinea === "credito")
    .reduce((total, venta) => total + (Number(venta.precioVentaTotal) || 0), 0);
  const manoObraVendida = ventas
    .filter((venta) => venta.tipoLinea === "manoobra")
    .reduce((total, venta) => total + (Number(venta.precioVentaTotal) || 0), 0);
  const ingresos = ventasProductos + abonosCredito + manoObraVendida;
  const egresos = egresosCompras + manoObraPorPagar;

  return {
    ventasProductos,
    abonosCredito,
    manoObraVendida,
    egresosCompras,
    manoObraPorPagar,
    ingresos,
    egresos,
    balanceEstimado: ingresos - egresos,
  };
}
