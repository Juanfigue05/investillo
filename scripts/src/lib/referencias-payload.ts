export type CampoReferencia = {
  ruta: string;
  entidad: string;
};

export type ReglaReferencias = {
  metodo: string | readonly string[];
  endpoint: string;
  campos: readonly CampoReferencia[];
};

export type ReferenciaPayload = {
  entidad: string;
  valorLocal: string;
};

export type ResultadoResolucionEndpoint = {
  endpoint: string;
  cambiado: boolean;
};

export const REGLAS_REFERENCIAS: readonly ReglaReferencias[] = [
  {
    metodo: "POST",
    endpoint: "/ventas",
    campos: [{ ruta: "productoId", entidad: "producto" }],
  },
  {
    metodo: "PUT",
    endpoint: "/ventas/reordenar",
    campos: [{ ruta: "ids[]", entidad: "venta" }],
  },
  {
    metodo: "PUT",
    endpoint: "/ventas/:id",
    campos: [
      { ruta: "productoId", entidad: "producto" },
      { ruta: "distribuciones[].trabajadorId", entidad: "trabajador" },
    ],
  },
  {
    metodo: "POST",
    endpoint: "/ventas/lote-pago-antiguo",
    campos: [{ ruta: "items[].productoId", entidad: "producto" }],
  },
  {
    metodo: "POST",
    endpoint: "/ventas/manoobra",
    campos: [{ ruta: "distribuciones[].trabajadorId", entidad: "trabajador" }],
  },
  {
    metodo: "PUT",
    endpoint: "/ventas/reordenar",
    campos: [{ ruta: "ids[]", entidad: "venta" }],
  },
  { metodo: "POST", endpoint: "/ventas/:id/trasladar", campos: [] },
  {
    metodo: "POST",
    endpoint: "/compras",
    campos: [{ ruta: "productoId", entidad: "producto" }],
  },
  { metodo: ["PUT", "DELETE"], endpoint: "/compras/:id", campos: [] },
  { metodo: "PATCH", endpoint: "/compras/:id/corregir", campos: [] },
  {
    metodo: "POST",
    endpoint: "/compras/lote-llegada",
    campos: [{ ruta: "items[].id", entidad: "compra" }],
  },
  { metodo: "POST", endpoint: "/clientes/:clienteId/vehiculos", campos: [] },
  {
    metodo: ["PUT", "DELETE"],
    endpoint: "/clientes/:clienteId/vehiculos/:id",
    campos: [],
  },
  { metodo: "PUT", endpoint: "/clientes/:id", campos: [] },
  {
    metodo: "POST",
    endpoint: "/creditos",
    campos: [
      { ruta: "lineas[].productoId", entidad: "producto" },
      { ruta: "manoObra.trabajadores[].id", entidad: "trabajador" },
    ],
  },
  {
    metodo: "PUT",
    endpoint: "/creditos/reordenar",
    campos: [{ ruta: "ids[]", entidad: "credito" }],
  },
  {
    metodo: "PUT",
    endpoint: "/creditos/:id",
    campos: [
      { ruta: "lineas[].id", entidad: "credito_linea" },
      { ruta: "lineas[].productoId", entidad: "producto" },
      { ruta: "manoObra.trabajadores[].id", entidad: "trabajador" },
    ],
  },
  {
    metodo: "POST",
    endpoint: "/creditos/:creditoId/abono",
    campos: [{ ruta: "lineas[].lineaId", entidad: "credito_linea" }],
  },
  {
    metodo: ["PUT", "DELETE"],
    endpoint: "/creditos/:creditoId/abono/:id",
    campos: [{ ruta: "lineas[].lineaId", entidad: "credito_linea" }],
  },
  {
    metodo: "POST",
    endpoint: "/descuentos-inventario",
    campos: [{ ruta: "items[].productoId", entidad: "producto" }],
  },
  {
    metodo: ["PUT", "DELETE"],
    endpoint: "/descuentos-inventario/:id",
    campos: [],
  },
  {
    metodo: "POST",
    endpoint: "/grupos-trabajo",
    campos: [{ ruta: "trabajadorIds[]", entidad: "trabajador" }],
  },
  {
    metodo: "POST",
    endpoint: "/obra-electronica",
    campos: [{ ruta: "trabajadorId", entidad: "trabajador" }],
  },
  {
    metodo: "PATCH",
    endpoint: "/reportes/nomina/dia",
    campos: [{ ruta: "trabajadorId", entidad: "trabajador" }],
  },
  {
    metodo: "POST",
    endpoint: "/cierre-diario",
    campos: [
      { ruta: "datos[].trabajadorId", entidad: "trabajador" },
      { ruta: "datos.trabajadores[].trabajadorId", entidad: "trabajador" },
    ],
  },
  {
    metodo: "POST",
    endpoint: "/manoobra",
    campos: [{ ruta: "distribuciones[].trabajadorId", entidad: "trabajador" }],
  },
  {
    metodo: ["PUT", "DELETE"],
    endpoint: "/manoobra/:id",
    campos: [{ ruta: "distribuciones[].trabajadorId", entidad: "trabajador" }],
  },
] as const;

function metodosDe(regla: ReglaReferencias): readonly string[] {
  return typeof regla.metodo === "string" ? [regla.metodo] : regla.metodo;
}

function rutaSinConsulta(endpoint: string): string {
  return endpoint.split("?", 1)[0] ?? endpoint;
}

function coincidePatron(patron: string, endpoint: string): boolean {
  const segmentosPatron = patron.split("/");
  const segmentosEndpoint = rutaSinConsulta(endpoint).split("/");
  return (
    segmentosPatron.length === segmentosEndpoint.length &&
    segmentosPatron.every((segmento, indice) =>
      segmento.startsWith(":")
        ? segmentosEndpoint[indice] !== ""
        : segmento === segmentosEndpoint[indice],
    )
  );
}

export function encontrarRegla(
  metodo: string,
  endpoint: string,
): ReglaReferencias | undefined {
  return REGLAS_REFERENCIAS.find(
    (regla) =>
      metodosDe(regla).includes(metodo.toUpperCase()) &&
      coincidePatron(regla.endpoint, endpoint),
  );
}

function leerRuta(valor: unknown, segmentos: string[]): unknown[] {
  if (segmentos.length === 0) return [valor];
  if (valor === null || typeof valor !== "object") return [];

  const [segmento, ...resto] = segmentos;
  if (!segmento) return [];
  const esArreglo = segmento.endsWith("[]");
  const propiedad = esArreglo ? segmento.slice(0, -2) : segmento;
  const siguiente = (valor as Record<string, unknown>)[propiedad];
  if (esArreglo) {
    if (!Array.isArray(siguiente)) return [];
    return siguiente.flatMap((elemento) => leerRuta(elemento, resto));
  }
  return leerRuta(siguiente, resto);
}

function valoresDeRuta(payload: unknown, ruta: string): unknown[] {
  return leerRuta(payload, ruta.split("."));
}

function normalizarId(valor: unknown): string | undefined {
  if (typeof valor !== "number" && typeof valor !== "string") return undefined;
  const texto = String(valor);
  return texto.trim() === "" ? undefined : texto;
}

function claveDe(entidad: string, valorLocal: string): string {
  return `${entidad}:${valorLocal}`;
}

export function extraerReferencias(
  regla: ReglaReferencias,
  payload: unknown,
): ReferenciaPayload[] {
  const referencias: ReferenciaPayload[] = [];
  const vistas = new Set<string>();
  for (const campo of regla.campos) {
    for (const valor of valoresDeRuta(payload, campo.ruta)) {
      const valorLocal = normalizarId(valor);
      if (valorLocal === undefined) continue;
      const clave = claveDe(campo.entidad, valorLocal);
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      referencias.push({ entidad: campo.entidad, valorLocal });
    }
  }
  return referencias;
}

function traducirRuta(
  valor: unknown,
  segmentos: string[],
  entidad: string,
  mapa: ReadonlyMap<string, string>,
): unknown {
  if (segmentos.length === 0) {
    const valorLocal = normalizarId(valor);
    if (valorLocal === undefined) return valor;
    const remoto = mapa.get(claveDe(entidad, valorLocal));
    if (remoto === undefined) return valor;
    return typeof valor === "number" ? Number(remoto) : remoto;
  }
  if (valor === null || typeof valor !== "object") return valor;

  const [segmento, ...resto] = segmentos;
  if (!segmento) return valor;
  const esArreglo = segmento.endsWith("[]");
  const propiedad = esArreglo ? segmento.slice(0, -2) : segmento;
  const objeto = valor as Record<string, unknown>;
  const siguiente = objeto[propiedad];
  if (esArreglo) {
    if (!Array.isArray(siguiente)) return valor;
    return {
      ...objeto,
      [propiedad]: siguiente.map((elemento) =>
        traducirRuta(elemento, resto, entidad, mapa),
      ),
    };
  }
  const traducido = traducirRuta(siguiente, resto, entidad, mapa);
  if (traducido === siguiente) return valor;
  return { ...objeto, [propiedad]: traducido };
}

export function traducirPayload(
  regla: ReglaReferencias,
  payload: unknown,
  mapa: ReadonlyMap<string, string>,
): unknown {
  let resultado = payload;
  for (const campo of regla.campos) {
    resultado = traducirRuta(
      resultado,
      campo.ruta.split("."),
      campo.entidad,
      mapa,
    );
  }
  return resultado;
}

export function resolverEndpoint(
  endpoint: string,
  entidadIdLocal: string,
  idRemoto: string,
): ResultadoResolucionEndpoint {
  const indiceConsulta = endpoint.indexOf("?");
  const ruta =
    indiceConsulta < 0 ? endpoint : endpoint.slice(0, indiceConsulta);
  const consulta = indiceConsulta < 0 ? "" : endpoint.slice(indiceConsulta);
  const segmentos = ruta.split("/");
  let cambiado = false;
  const resueltos = segmentos.map((segmento) => {
    if (segmento !== entidadIdLocal) return segmento;
    cambiado = true;
    return idRemoto;
  });
  return {
    endpoint: `${resueltos.join("/")}${consulta}`,
    cambiado,
  };
}
