import { coincideBusqueda, soloDigitos } from "./utils";

interface DatosBusquedaCredito {
  nombreCliente: string;
  concepto?: string | null;
  telefonoCliente?: string | null;
  placaVehiculo?: string | null;
}

interface CreditoReferencia {
  id: number;
  nombreCliente: string;
  concepto?: string | null;
}

function normalizarReferencia(valor: string | null | undefined): string {
  return (valor || "").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

export function buscarCreditoDuplicadoPorReferencia<T extends CreditoReferencia>(
  creditos: T[],
  concepto: string,
  nombreCliente: string,
  excluirId?: number | null,
): T | undefined {
  const conceptoNormalizado = normalizarReferencia(concepto);
  const clienteNormalizado = normalizarReferencia(nombreCliente);
  if (!conceptoNormalizado || !clienteNormalizado) return undefined;
  return creditos.find((credito) =>
    credito.id !== excluirId &&
    normalizarReferencia(credito.concepto) === conceptoNormalizado &&
    normalizarReferencia(credito.nombreCliente) === clienteNormalizado,
  );
}

export function coincideBusquedaCredito(
  credito: DatosBusquedaCredito,
  consulta: string,
): boolean {
  const consultaLimpia = consulta.trim();
  if (!consultaLimpia) return true;

  const numeroConsultado = soloDigitos(consultaLimpia);
  const coincideTelefono =
    numeroConsultado.length > 0 &&
    soloDigitos(credito.telefonoCliente).includes(numeroConsultado);

  return (
    coincideBusqueda(
      consultaLimpia,
      credito.nombreCliente,
      credito.concepto,
      credito.placaVehiculo,
    ) || coincideTelefono
  );
}
