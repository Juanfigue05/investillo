import type { TablaHuella } from "@workspace/db/schema";

export type CampoReferencia = {
  ruta: string;
  entidad: string;
};

export type SegmentoReferencia = {
  parametro: string;
  entidad: string;
};

export type ReglaReferencias = {
  metodo: string | readonly string[];
  endpoint: string;
  campos: readonly CampoReferencia[];
  segmentos?: readonly SegmentoReferencia[];
};

export const ENTIDAD_TABLA = {
  producto: "productos",
  cliente: "clientes",
  vehiculo: "vehiculos_cliente",
  credito: "creditos",
  credito_linea: "credito_lineas",
  abono_credito: "abonos_creditos",
  venta: "ventas_diarias",
  compra: "compras",
  trabajador: "trabajadores",
  pago_seguro: "pagos_seguro",
  mano_obra: "mano_obra",
  grupo_trabajo: "grupos_trabajo_default",
  descuento_inventario: "descuentos_inventario",
  historial_precios: "historial_precios",
  obra_electronica: "obra_electronica",
  remachada: "remachadas",
  tensionada: "tensionadas",
  nota: "notas",
  historial: "historial_dias",
  cierre_diario: "cierre_diario",
} as const satisfies Readonly<Record<string, TablaHuella>>;

export const TABLAS_SIN_ENTIDAD = {
  distribuciones_mano_obra:
    "filas anidadas de mano_obra; ningún endpoint ni cuerpo de evento usa su id; se crean y se borran junto con su mano de obra o su venta",
} as const satisfies Partial<Record<TablaHuella, string>>;

export const ENTIDADES_SIN_TABLA = {
  calculadora_cierre: "singleton de configuración con ID fijo",
  conteo_monedas: "singleton de configuración con ID fijo",
  compra_lote: "operación de lote identificada por operationId",
  creditos_orden: "operación de reordenamiento identificada por operationId",
  ventas_orden: "operación de reordenamiento identificada por operationId",
  clientes_import: "operación de importación identificada por operationId",
  inventario_import: "operación de importación identificada por operationId",
} as const;

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
    metodo: ["PUT", "DELETE"],
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
  {
    metodo: "PUT",
    endpoint: "/clientes/:id",
    campos: [],
    segmentos: [{ parametro: "id", entidad: "cliente" }],
  },
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
    metodo: ["PUT", "DELETE"],
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
  { metodo: "POST", endpoint: "/inventario", campos: [] },
  { metodo: "PUT", endpoint: "/inventario/:id", campos: [] },
  { metodo: "PUT", endpoint: "/inventario/:id/stock", campos: [] },
  { metodo: "PUT", endpoint: "/inventario/:id/reactivar", campos: [] },
  { metodo: "DELETE", endpoint: "/inventario/:id", campos: [] },
  { metodo: "POST", endpoint: "/trabajadores", campos: [] },
  { metodo: "PUT", endpoint: "/trabajadores/:id", campos: [] },
  {
    metodo: "POST",
    endpoint: "/trabajadores/:trabajadorId/pagos-seguro",
    campos: [],
  },
  {
    metodo: "DELETE",
    endpoint: "/trabajadores/:trabajadorId/pagos-seguro/:id",
    campos: [],
  },
  { metodo: "POST", endpoint: "/clientes", campos: [] },
  {
    metodo: "DELETE",
    endpoint: "/clientes/:id",
    campos: [],
    segmentos: [{ parametro: "id", entidad: "cliente" }],
  },
  { metodo: ["PUT", "DELETE"], endpoint: "/obra-electronica/:id", campos: [] },
  { metodo: "POST", endpoint: "/remachadas", campos: [] },
  { metodo: ["PUT", "DELETE"], endpoint: "/remachadas/:id", campos: [] },
  { metodo: "POST", endpoint: "/tensionadas", campos: [] },
  { metodo: ["PATCH", "DELETE"], endpoint: "/tensionadas/:id", campos: [] },
  { metodo: "POST", endpoint: "/historial", campos: [] },
  { metodo: ["PUT", "DELETE"], endpoint: "/historial/:id", campos: [] },
  { metodo: "DELETE", endpoint: "/historial-precios/:id", campos: [] },
  {
    metodo: "DELETE",
    endpoint: "/historial-precios/producto/:productoId",
    campos: [],
    segmentos: [{ parametro: "productoId", entidad: "producto" }],
  },
  { metodo: "PUT", endpoint: "/notas", campos: [] },
  { metodo: "DELETE", endpoint: "/cierre-diario/:id", campos: [] },
  { metodo: "PUT", endpoint: "/calculadora-cierre", campos: [] },
  { metodo: "DELETE", endpoint: "/calculadora-cierre", campos: [] },
  { metodo: "PUT", endpoint: "/conteo-monedas", campos: [] },
  { metodo: "POST", endpoint: "/clientes-import/sincronizar", campos: [] },
  { metodo: "POST", endpoint: "/inventario-import/sincronizar", campos: [] },
  {
    metodo: "POST",
    endpoint: "/inventario-import/resolver-cantidades",
    campos: [],
  },
  {
    metodo: "POST",
    endpoint: "/inventario-import/aplicar-completo",
    campos: [],
  },
  {
    metodo: "PATCH",
    endpoint: "/grupos-trabajo/:id/desactivar",
    campos: [],
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
  indiceSegmento?: number,
): ResultadoResolucionEndpoint {
  const indiceConsulta = endpoint.indexOf("?");
  const ruta =
    indiceConsulta < 0 ? endpoint : endpoint.slice(0, indiceConsulta);
  const consulta = indiceConsulta < 0 ? "" : endpoint.slice(indiceConsulta);
  const segmentos = ruta.split("/");
  let cambiado = false;
  const resueltos = segmentos.map((segmento, indice) => {
    if (
      segmento !== entidadIdLocal ||
      (indiceSegmento !== undefined && indice !== indiceSegmento)
    ) return segmento;
    cambiado = true;
    return idRemoto;
  });
  return {
    endpoint: `${resueltos.join("/")}${consulta}`,
    cambiado,
  };
}
