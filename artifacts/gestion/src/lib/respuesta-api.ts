const MENSAJES_POR_ESTADO: Record<number, string> = {
  400: "Los datos enviados no son válidos. Revísalos e inténtalo de nuevo.",
  404: "No se encontró el registro solicitado.",
  409: "El servidor rechazó el cambio por un conflicto. Actualiza la información e inténtalo de nuevo.",
};

function mensajeHttp(status: number): string {
  if (MENSAJES_POR_ESTADO[status]) return MENSAJES_POR_ESTADO[status];
  if (status >= 500) return "El servidor tuvo un problema al guardar. Inténtalo más tarde.";
  return `El servidor respondió con un error (HTTP ${status}).`;
}

function mensajeDelServidor(body: unknown): string | undefined {
  if (body && typeof body === "object" && "error" in body) {
    const error = body.error;
    if (typeof error === "string" && error.trim()) return error;
  }
  return undefined;
}

export async function leerRespuestaApi<T>(
  respuesta: Response | Promise<Response>,
): Promise<T> {
  let response: Response;
  try {
    response = await respuesta;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.");
    }
    throw error;
  }

  const texto = await response.text().catch(() => "");
  let body: unknown = texto;
  if (texto) {
    try {
      body = JSON.parse(texto);
    } catch {
      body = texto;
    }
  } else {
    body = undefined;
  }

  if (!response.ok) {
    throw new Error(mensajeDelServidor(body) || mensajeHttp(response.status));
  }
  return body as T;
}
