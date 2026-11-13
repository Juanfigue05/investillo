export type RangoMes = { desde: string; hasta: string };

export function obtenerRangoMesCreditos(mes: string): RangoMes | null {
  const coincidencia = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!coincidencia) return null;

  const anio = Number(coincidencia[1]);
  const numeroMes = Number(coincidencia[2]);
  if (anio < 1 || numeroMes < 1 || numeroMes > 12) return null;

  const esBisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
  const diasPorMes = [31, esBisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return {
    desde: `${mes}-01`,
    hasta: `${mes}-${String(diasPorMes[numeroMes - 1]).padStart(2, "0")}`,
  };
}

type CreditoMes = { valorCredito: string | number; valorAbonado: string | number };

export function resumirCreditosMes(creditos: CreditoMes[]) {
  let totalCentavos = 0;
  let pendienteCentavos = 0;
  let cantidadPendientes = 0;

  for (const credito of creditos) {
    const valorCentavos = Math.round(Number(credito.valorCredito) * 100);
    const abonadoCentavos = Math.round(Number(credito.valorAbonado) * 100);
    if (!Number.isFinite(valorCentavos) || !Number.isFinite(abonadoCentavos)) {
      throw new Error("Los valores de los créditos deben ser numéricos.");
    }

    const pendiente = Math.max(0, valorCentavos - abonadoCentavos);
    totalCentavos += valorCentavos;
    pendienteCentavos += pendiente;
    if (pendiente > 0) cantidadPendientes++;
  }

  return {
    totalCreditosMes: totalCentavos / 100,
    saldoPendienteMes: pendienteCentavos / 100,
    cantidadCreditosMes: creditos.length,
    cantidadPendientesMes: cantidadPendientes,
  };
}
