import {
  encolarOperacion,
  OperacionEncoladaOfflineError,
  OperacionOfflineNoGuardadaError,
  type OperacionPendiente,
} from "./offline-db";

type FormDataOffline = {
  __investilloFormData: true;
  entries: Array<[string, string | Blob, string?]>;
};

type BodyOffline =
  | FormDataOffline
  | { __investilloBody: "text"; contentType: string; value: string }
  | { __investilloNoBody: true }
  | unknown;

const TIPO_POR_RECURSO: Record<string, string> = {
  "calculadora-cierre": "calculadora_cierre",
  "cierre-diario": "cierre_diario",
  clientes: "cliente",
  "clientes-import": "cliente",
  compras: "compra",
  "conteo-monedas": "conteo_monedas",
  creditos: "credito",
  "descuentos-inventario": "descuento_inventario",
  "grupos-trabajo": "grupo_trabajo",
  historial: "historial",
  "historial-precios": "historial_precio",
  inventario: "producto",
  manoobra: "manoobra",
  notas: "nota",
  "inventario-import": "producto",
  "obra-electronica": "obra_electronica",
  preferencias: "preferencia",
  reportes: "reporte",
  remachadas: "remachada",
  tensionadas: "tensionada",
  trabajadores: "trabajador",
  ventas: "venta",
};

function isApiMutation(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return false;
  const url = new URL(request.url);
  return (
    url.origin === window.location.origin && /^\/api(?:\/|$)/.test(url.pathname)
  );
}

async function serializeBody(request: Request): Promise<BodyOffline> {
  if (!request.body) return { __investilloNoBody: true };

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const copy = request.clone();

  if (contentType.includes("multipart/form-data")) {
    const formData = await copy.formData();
    const entries: FormDataOffline["entries"] = [];
    formData.forEach((value, key) => {
      if (typeof value === "string") {
        entries.push([key, value]);
      } else {
        entries.push([
          key,
          value,
          typeof File !== "undefined" && value instanceof File
            ? value.name
            : "archivo",
        ]);
      }
    });
    return { __investilloFormData: true, entries };
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return { __investilloBody: "text", contentType, value: await copy.text() };
  }

  if (
    contentType.includes("application/json") ||
    contentType.includes("+json")
  ) {
    const text = await copy.text();
    return text ? JSON.parse(text) : {};
  }

  if (contentType.startsWith("text/")) {
    return { __investilloBody: "text", contentType, value: await copy.text() };
  }

  throw new TypeError(
    "Este tipo de archivo o solicitud requiere internet y no se guardó localmente.",
  );
}

function notifyNotSaved(endpoint: string, reason: string) {
  window.dispatchEvent(
    new CustomEvent("investillo:operacion-no-guardada", {
      detail: { endpoint, reason },
    }),
  );
}

async function queueRequest(request: Request): Promise<never> {
  const url = new URL(request.url);
  const endpoint = `${url.pathname.replace(/^\/api/, "")}${url.search}`;
  const operationId =
    request.headers.get("x-operation-id") ?? crypto.randomUUID();

  try {
    const payload = await serializeBody(request);
    const resource = url.pathname.replace(/^\/api\/?/, "").split("/")[0] ?? "";
    const operation: Omit<OperacionPendiente, "creadoEn" | "estado"> = {
      operationId,
      tipo:
        url.pathname === "/api/ventas/manoobra"
          ? "manoobra_venta"
          : url.pathname === "/api/ventas/lote-pago-antiguo"
            ? "venta_lote_pago_antiguo"
            : (TIPO_POR_RECURSO[resource] ?? resource.replace(/-/g, "_")),
      metodo: request.method as OperacionPendiente["metodo"],
      endpoint,
      payload,
    };
    await encolarOperacion(operation);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "No se pudo guardar localmente.";
    notifyNotSaved(endpoint, reason);
    throw new OperacionOfflineNoGuardadaError(reason);
  }

  throw new OperacionEncoladaOfflineError(operationId, endpoint);
}

export function instalarColaDeEscriturasOffline() {
  if (typeof window === "undefined") return;
  const fetchOriginal = window.fetch.bind(window);

  window.fetch = (input, init) => {
    let request: Request;
    try {
      request =
        input instanceof Request
          ? new Request(input, init)
          : new Request(input, init);
    } catch (error) {
      return Promise.reject(error);
    }

    if (!isApiMutation(request)) return fetchOriginal(input, init);

    const headers = new Headers(request.headers);
    if (!headers.has("x-operation-id")) {
      headers.set("x-operation-id", crypto.randomUUID());
    }
    request = new Request(request, { headers });

    if (!navigator.onLine) {
      return queueRequest(request);
    }

    const requestForQueue = request.clone();
    return fetchOriginal(request).catch((error: unknown) => {
      if (!(error instanceof TypeError)) {
        throw error;
      }
      return queueRequest(requestForQueue);
    });
  };
}

export function reconstruirCuerpoOffline(payload: unknown): {
  body?: BodyInit;
  contentType?: string;
} {
  if (
    payload &&
    typeof payload === "object" &&
    "__investilloNoBody" in payload &&
    payload.__investilloNoBody === true
  ) {
    return {};
  }
  if (
    payload &&
    typeof payload === "object" &&
    "__investilloFormData" in payload &&
    payload.__investilloFormData === true &&
    "entries" in payload &&
    Array.isArray(payload.entries)
  ) {
    const formData = new FormData();
    for (const entry of payload.entries) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const [key, value, filename] = entry as [string, string | Blob, string?];
      if (value instanceof Blob) {
        formData.append(key, value, filename);
      } else {
        formData.append(key, value);
      }
    }
    return { body: formData };
  }

  if (
    payload &&
    typeof payload === "object" &&
    "__investilloBody" in payload &&
    payload.__investilloBody === "text" &&
    "contentType" in payload &&
    typeof payload.contentType === "string" &&
    "value" in payload &&
    typeof payload.value === "string"
  ) {
    return {
      body: payload.value,
      contentType: payload.contentType,
    };
  }

  return {
    body: JSON.stringify(payload),
    contentType: "application/json",
  };
}
