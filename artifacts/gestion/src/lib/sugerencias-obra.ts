export const CLAVE_FACTURAS_OBRA = "obra-electronica-facturas-recientes";
export const CLAVE_VEHICULOS_OBRA = "obra-electronica-vehiculos-recientes";
export const CLAVE_TRABAJADORES_OBRA = "obra-electronica-trabajadores-recientes";
export const CLAVE_VALORES_OBRA = "obra-electronica-valores-recientes";
const MAX_SUGERENCIAS = 8;

type AlmacenamientoLocal = Pick<Storage, "getItem" | "setItem">;

export function agregarSugerenciaReciente(
  actuales: string[],
  nuevoValor: string,
  limite = MAX_SUGERENCIAS,
): string[] {
  const nuevo = nuevoValor.trim();
  if (!nuevo) return actuales;

  const vistos = new Set<string>();
  return [nuevo, ...actuales].filter((valor) => {
    const limpio = valor.trim();
    const clave = limpio.toLocaleLowerCase();
    if (!limpio || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  }).slice(0, limite);
}

export function cargarSugerenciasRecientes(
  clave: string,
  almacenamiento: AlmacenamientoLocal = localStorage,
): string[] {
  try {
    const datos: unknown = JSON.parse(almacenamiento.getItem(clave) || "[]");
    return Array.isArray(datos)
      ? datos.filter((valor): valor is string => typeof valor === "string")
      : [];
  } catch (error) {
    console.warn("No se pudieron leer las sugerencias recientes de obra electrónica.", error);
    return [];
  }
}

export function guardarSugerenciaReciente(
  clave: string,
  valor: string,
  actuales: string[],
  almacenamiento: AlmacenamientoLocal = localStorage,
): string[] {
  const nuevas = agregarSugerenciaReciente(actuales, valor);
  try {
    almacenamiento.setItem(clave, JSON.stringify(nuevas));
  } catch (error) {
    console.warn("No se pudieron guardar las sugerencias recientes de obra electrónica.", error);
  }
  return nuevas;
}

export function cargarTrabajadoresRecientes(
  almacenamiento: AlmacenamientoLocal = localStorage,
): number[] {
  try {
    const datos: unknown = JSON.parse(almacenamiento.getItem(CLAVE_TRABAJADORES_OBRA) || "[]");
    return Array.isArray(datos)
      ? datos.filter((id): id is number => Number.isInteger(id) && id > 0).slice(0, MAX_SUGERENCIAS)
      : [];
  } catch (error) {
    console.warn("No se pudieron leer los trabajadores recientes de obra electrónica.", error);
    return [];
  }
}

export function guardarTrabajadoresRecientes(
  nuevosIds: number[],
  actuales: number[],
  almacenamiento: AlmacenamientoLocal = localStorage,
): number[] {
  const ids = [...new Set([...nuevosIds, ...actuales])].slice(0, MAX_SUGERENCIAS);
  try {
    almacenamiento.setItem(CLAVE_TRABAJADORES_OBRA, JSON.stringify(ids));
  } catch (error) {
    console.warn("No se pudieron guardar los trabajadores recientes de obra electrónica.", error);
  }
  return ids;
}

export function ordenarPorUsoReciente<T extends { id: number }>(
  elementos: T[],
  idsRecientes: number[],
): T[] {
  const posiciones = new Map(idsRecientes.map((id, indice) => [id, indice]));
  return [...elementos].sort((a, b) =>
    (posiciones.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
    (posiciones.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function filtrarTrabajadoresPorNombre<T extends { nombre: string }>(
  trabajadores: T[],
  busqueda: string,
): T[] {
  const normalizar = (texto: string) =>
    texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  const consulta = normalizar(busqueda.trim());
  return consulta
    ? trabajadores.filter((trabajador) => normalizar(trabajador.nombre).includes(consulta))
    : trabajadores;
}
