export interface CompraRecibidaResumen {
  id: number;
  estado: string;
  fechaLlegada: string | null;
  productoNombre: string;
  proveedor: string | null;
  cantidadRecibida: string | number | null;
  precioCompraRegistrado: string | number | null;
}

export function resumirComprasRecibidas(
  compras: CompraRecibidaResumen[],
  fecha: string,
) {
  const items = compras
    .filter((compra) => compra.estado === "llegado" && compra.fechaLlegada === fecha)
    .map((compra) => {
      const cantidad = Number(compra.cantidadRecibida) || 0;
      const precioUnitario = Number(compra.precioCompraRegistrado) || 0;
      return {
        id: compra.id,
        productoNombre: compra.productoNombre,
        proveedor: compra.proveedor,
        cantidad,
        precioUnitario,
        total: Math.round(cantidad * precioUnitario * 100) / 100,
      };
    });

  return {
    fecha,
    cantidadCompras: items.length,
    total: Math.round(items.reduce((suma, item) => suma + item.total, 0) * 100) / 100,
    items,
  };
}
