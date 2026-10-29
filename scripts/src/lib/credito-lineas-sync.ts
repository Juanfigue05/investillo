export type ReferenciaRespuesta = {
  campo: string;
  entidad: string;
  valorLocal: string;
};

export type RelacionId = {
  entidad: string;
  idLocal: string;
  idRemoto: string;
};

export type ReferenciaEndpoint = {
  marcador: string;
  entidad: string;
  valorLocal: string;
};

export function resolverEndpointConReferencias(
  endpoint: string,
  referencias: ReferenciaEndpoint[],
  idsDestino: ReadonlyMap<string, string>,
): string {
  let resuelto = endpoint;
  for (const referencia of referencias) {
    const idDestino = idsDestino.get(
      `${referencia.entidad}:${referencia.valorLocal}`,
    );
    if (!idDestino) {
      throw new Error(
        `Referencia sin resolver: ${referencia.entidad} id=${referencia.valorLocal}`,
      );
    }
    if (resuelto.includes(referencia.marcador)) {
      resuelto = resuelto.replace(referencia.marcador, idDestino);
    } else {
      const queryIndex = resuelto.indexOf("?");
      const ruta = queryIndex < 0 ? resuelto : resuelto.slice(0, queryIndex);
      const query = queryIndex < 0 ? "" : resuelto.slice(queryIndex);
      const segmentos = ruta.split("/");
      const indice = segmentos.indexOf(referencia.valorLocal);
      if (indice >= 0) segmentos[indice] = idDestino;
      resuelto = `${segmentos.join("/")}${query}`;
    }
  }
  if (resuelto.replaceAll("{id}", "").includes("{")) {
    throw new Error(`Endpoint sin resolver por completo: ${resuelto}`);
  }
  return resuelto;
}

export function idsLineaPendiente(
  ids: string[],
  relaciones: ReadonlyMap<string, string>,
  pendientes: ReadonlySet<string>,
): string[] {
  return ids.filter((id) => !relaciones.has(id) && pendientes.has(id));
}

export function valorEnRuta(valor: unknown, ruta: string): unknown {
  return ruta.split(".").reduce<unknown>((actual, segmento) => {
    if (actual === null || typeof actual !== "object") return undefined;
    return (actual as Record<string, unknown>)[segmento];
  }, valor);
}

export function relacionesDeRespuesta(
  referencias: ReferenciaRespuesta[],
  respuesta: unknown,
  origen: "local" | "remoto",
): RelacionId[] {
  const relaciones: RelacionId[] = [];

  for (const referencia of referencias) {
    const idDestino = valorEnRuta(respuesta, referencia.campo);
    if (
      (typeof idDestino !== "number" && typeof idDestino !== "string") ||
      !/^\d+$/.test(String(idDestino))
    ) {
      continue;
    }

    relaciones.push(
      origen === "local"
        ? {
            entidad: referencia.entidad,
            idLocal: referencia.valorLocal,
            idRemoto: String(idDestino),
          }
        : {
            entidad: referencia.entidad,
            idLocal: String(idDestino),
            idRemoto: referencia.valorLocal,
          },
    );
  }

  return relaciones;
}

function rutaSinQuery(endpoint: string): string {
  return endpoint.split("?")[0] ?? endpoint;
}

export function endpointDeRecuperacion(
  metodo: string,
  endpointOriginal: string,
  endpointResuelto: string,
  recursoId: number | string | null | undefined,
): string {
  if (
    metodo === "POST" &&
    rutaSinQuery(endpointOriginal) === "/creditos" &&
    recursoId !== null &&
    recursoId !== undefined
  ) {
    return `/creditos/${recursoId}`;
  }
  return endpointResuelto;
}

function tipoCampoLinea(endpoint: string): "id" | "lineaId" | undefined {
  const ruta = rutaSinQuery(endpoint);
  if (/^\/creditos(?:\/\d+)?$/.test(ruta)) return "id";
  if (/^\/creditos\/(?:\d+|\{[^/]+\})\/abono(?:\/(?:\d+|\{[^/]+\}))?$/.test(ruta)) {
    return "lineaId";
  }
  return undefined;
}

export function idsLineaCreditoEnPayload(
  payload: unknown,
  endpoint: string,
): string[] {
  const campoId = tipoCampoLinea(endpoint);
  if (!campoId || payload === null || typeof payload !== "object") return [];

  const lineas = (payload as Record<string, unknown>).lineas;
  if (!Array.isArray(lineas)) return [];

  return lineas.flatMap((linea) => {
    if (linea === null || typeof linea !== "object") return [];
    const id = (linea as Record<string, unknown>)[campoId];
    return (typeof id === "number" || typeof id === "string") && /^\d+$/.test(String(id))
      ? [String(id)]
      : [];
  });
}

export function traducirIdsLineaCredito(
  payload: unknown,
  endpoint: string,
  relaciones: ReadonlyMap<string, string>,
): unknown {
  const campoId = tipoCampoLinea(endpoint);
  if (!campoId || payload === null || typeof payload !== "object") return payload;

  const objeto = payload as Record<string, unknown>;
  if (!Array.isArray(objeto.lineas)) return payload;

  return {
    ...objeto,
    lineas: objeto.lineas.map((linea) => {
      if (linea === null || typeof linea !== "object") return linea;
      const datosLinea = linea as Record<string, unknown>;
      const id = datosLinea[campoId];
      if ((typeof id !== "number" && typeof id !== "string") || !/^\d+$/.test(String(id))) {
        return linea;
      }

      const traducido = relaciones.get(String(id));
      if (traducido === undefined) return linea;

      return {
        ...datosLinea,
        [campoId]: typeof id === "number" ? Number(traducido) : traducido,
      };
    }),
  };
}

export function traducirIdCreditoEnEndpoint(
  endpoint: string,
  relaciones: ReadonlyMap<string, string>,
): string {
  return endpoint.replace(
    /^(\/creditos\/)(\d+)(?=\/|$)/,
    (coincidencia, prefijo: string, id: string) =>
      `${prefijo}${relaciones.get(id) ?? id}`,
  );
}

export function traducirIdRecursoEnEndpoint(
  endpoint: string,
  idOrigen: string,
  idDestino: string,
): string {
  const queryIndex = endpoint.indexOf("?");
  const ruta = queryIndex < 0 ? endpoint : endpoint.slice(0, queryIndex);
  const query = queryIndex < 0 ? "" : endpoint.slice(queryIndex);
  const segmentos = ruta.split("/");
  if (segmentos.at(-1) === idOrigen) {
    segmentos[segmentos.length - 1] = idDestino;
  }
  return `${segmentos.join("/")}${query}`;
}
