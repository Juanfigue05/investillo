export interface RegistroBusquedaGlobal {
  id: string;
  categoria: string;
  titulo: string;
  detalle: string;
  ruta: string;
  textoBusqueda: string;
}

export interface DatosBusquedaGlobal {
  creditos: unknown[];
  clientes: unknown[];
  trabajadores: unknown[];
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function texto(valor: unknown): string {
  return typeof valor === "string" || typeof valor === "number"
    ? String(valor).trim()
    : "";
}

function normalizar(valor: string): string {
  return valor.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

export function crearRegistrosBusquedaGlobal(
  datos: DatosBusquedaGlobal,
): RegistroBusquedaGlobal[] {
  const creditos = datos.creditos.flatMap((valor) => {
    if (!esObjeto(valor)) return [];
    const nombre = texto(valor.nombreCliente);
    const concepto = texto(valor.concepto);
    const placa = texto(valor.placaVehiculo);
    const telefono = texto(valor.telefonoCliente);
    const saldo = Number(valor.valorRestante) ||
      Math.max(0, (Number(valor.valorCredito) || 0) - (Number(valor.valorAbonado) || 0));
    const id = texto(valor.id);
    return [{
      id: `credito-${id}`,
      categoria: "Crédito",
      titulo: `${concepto || "Crédito"} · ${nombre || "Cliente sin nombre"}`,
      detalle: [placa, telefono, `Saldo: $${saldo.toLocaleString("es-CO")}`].filter(Boolean).join(" · "),
      ruta: "/creditos",
      textoBusqueda: [nombre, concepto, placa, telefono].join(" "),
    }];
  });

  const clientes = datos.clientes.flatMap((valor) => {
    if (!esObjeto(valor)) return [];
    const nombre = texto(valor.nombre);
    const telefono = [texto(valor.telefono), texto(valor.telefono2)].filter(Boolean).join(" · ");
    const vehiculos = Array.isArray(valor.vehiculos) ? valor.vehiculos : [];
    const placas = vehiculos.flatMap((vehiculo) =>
      esObjeto(vehiculo) ? [texto(vehiculo.placa)] : [],
    ).filter(Boolean);
    const id = texto(valor.id);
    return [{
      id: `cliente-${id}`,
      categoria: "Cliente",
      titulo: nombre || "Cliente sin nombre",
      detalle: [telefono, placas.length ? `Vehículos: ${placas.join(", ")}` : ""].filter(Boolean).join(" · "),
      ruta: "/clientes",
      textoBusqueda: [nombre, telefono, texto(valor.correo), ...placas].join(" "),
    }];
  });

  const trabajadores = datos.trabajadores.flatMap((valor) => {
    if (!esObjeto(valor)) return [];
    const nombre = texto(valor.nombre);
    const telefono = texto(valor.telefono);
    const id = texto(valor.id);
    return [{
      id: `trabajador-${id}`,
      categoria: "Trabajador",
      titulo: nombre || "Trabajador sin nombre",
      detalle: telefono,
      ruta: "/mano-obra",
      textoBusqueda: [nombre, telefono, texto(valor.correo)].join(" "),
    }];
  });

  return [...creditos, ...clientes, ...trabajadores];
}

export function filtrarBusquedaGlobal(
  registros: readonly RegistroBusquedaGlobal[],
  consulta: string,
  limitePorCategoria = 5,
): RegistroBusquedaGlobal[] {
  const termino = normalizar(consulta.trim());
  if (!termino) return [];
  const terminoNumerico = termino.replace(/\D/g, "");

  const cantidades = new Map<string, number>();
  return registros.filter((registro) => {
    const textoBusqueda = normalizar(registro.textoBusqueda);
    const coincideTexto = textoBusqueda.includes(termino);
    const coincideNumero = terminoNumerico.length >= 2 &&
      textoBusqueda.replace(/\D/g, "").includes(terminoNumerico);
    if (!coincideTexto && !coincideNumero) return false;
    const cantidad = cantidades.get(registro.categoria) ?? 0;
    if (cantidad >= limitePorCategoria) return false;
    cantidades.set(registro.categoria, cantidad + 1);
    return true;
  });
}
