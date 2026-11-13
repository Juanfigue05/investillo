export interface ItemResumenCierre {
  mo: number;
  descuento: number;
  seguro: number;
  leDamos: number;
  nosDebe: number;
  total: number;
}

export function resumirCierre(items: ItemResumenCierre[]) {
  return items.reduce(
    (resumen, item) => ({
      manoObra: resumen.manoObra + item.mo,
      descuentos: resumen.descuentos + item.descuento,
      seguros: resumen.seguros + item.seguro,
      leDamos: resumen.leDamos + item.leDamos,
      nosDebe: resumen.nosDebe + item.nosDebe,
      total: resumen.total + item.total,
    }),
    { manoObra: 0, descuentos: 0, seguros: 0, leDamos: 0, nosDebe: 0, total: 0 },
  );
}
