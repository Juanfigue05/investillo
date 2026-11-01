export type DecisionRespuesta =
  | "INTERRUMPIR"
  | "LLAVE_RECHAZADA"
  | "RECHAZO_DEFINITIVO"
  | "REINTENTAR"
  | "ERROR";

export function clasificarRespuesta(
  codigoHttp: number | null,
  intentosPrevios: number,
): DecisionRespuesta {
  if (codigoHttp === null || [502, 503, 504].includes(codigoHttp)) {
    return "INTERRUMPIR";
  }
  if ([401, 403, 429].includes(codigoHttp)) {
    return "LLAVE_RECHAZADA";
  }
  if (codigoHttp === 409) {
    return "RECHAZO_DEFINITIVO";
  }
  if (codigoHttp >= 500) {
    return intentosPrevios < 2 ? "REINTENTAR" : "ERROR";
  }
  return "ERROR";
}
