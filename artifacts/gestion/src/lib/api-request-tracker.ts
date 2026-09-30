type Listener = () => void;

let solicitudesActivas = 0;
let instalado = false;
const listeners = new Set<Listener>();

function notificar() {
  listeners.forEach((listener) => listener());
}

function esGetDeApi(input: RequestInfo | URL, method?: string) {
  const metodo = method ?? (input instanceof Request ? input.method : "GET");
  if (metodo.toUpperCase() !== "GET") return false;

  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    const ruta = new URL(url, window.location.href);
    return ruta.origin === window.location.origin && /(?:^|\/)api(?:\/|$)/.test(ruta.pathname);
  } catch {
    return false;
  }
}

export function instalarSeguimientoGetApi() {
  if (instalado || typeof window === "undefined") return;
  instalado = true;

  const fetchOriginal = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (!esGetDeApi(input, init?.method)) return fetchOriginal(input, init);

    solicitudesActivas++;
    notificar();
    return fetchOriginal(input, init).finally(() => {
      solicitudesActivas--;
      notificar();
    });
  };
}

export function hayGetsApiActivos() {
  return solicitudesActivas > 0;
}

export function suscribirGetsApi(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}