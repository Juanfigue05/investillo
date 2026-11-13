const MAX_RECENT_OPTIONS = 8;

type AlmacenamientoRecientes = Pick<Storage, "getItem" | "setItem">;

function obtenerAlmacenamiento(
  almacenamiento?: AlmacenamientoRecientes,
): AlmacenamientoRecientes | undefined {
  if (almacenamiento) return almacenamiento;
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export function cargarIdsRecientes(
  clave: string,
  almacenamiento?: AlmacenamientoRecientes,
): string[] {
  try {
    const storage = obtenerAlmacenamiento(almacenamiento);
    if (!storage) return [];
    const datos: unknown = JSON.parse(storage.getItem(clave) || "[]");
    return Array.isArray(datos)
      ? datos.filter((id): id is string => typeof id === "string").slice(0, MAX_RECENT_OPTIONS)
      : [];
  } catch (error) {
    console.warn("No se pudieron leer las opciones usadas recientemente.", error);
    return [];
  }
}

export function guardarIdReciente(
  clave: string,
  id: string,
  actuales: string[],
  almacenamiento?: AlmacenamientoRecientes,
): string[] {
  const valor = id.trim();
  if (!valor) return actuales;

  const nuevas = [valor, ...actuales.filter((actual) => actual !== valor)]
    .slice(0, MAX_RECENT_OPTIONS);
  try {
    obtenerAlmacenamiento(almacenamiento)?.setItem(clave, JSON.stringify(nuevas));
  } catch (error) {
    console.warn("No se pudo guardar la opción usada recientemente.", error);
  }
  return nuevas;
}

export function ordenarOpcionesRecientes<T extends { id: string; recentId?: string }>(
  opciones: T[],
  idsRecientes: string[],
): T[] {
  const posiciones = new Map(idsRecientes.map((id, indice) => [id, indice]));
  return [...opciones].sort((a, b) =>
    (posiciones.get(a.recentId ?? a.id) ?? Number.MAX_SAFE_INTEGER) -
    (posiciones.get(b.recentId ?? b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}
