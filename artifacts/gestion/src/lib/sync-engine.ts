import { listarPendientes, marcarSincronizada } from "./offline-db";
import { queryClient } from "./queryClient";
import { toast } from "@/hooks/use-toast";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");

let sincronizando = false;

const QUERY_KEYS_POR_TIPO: Record<string, string[]> = {
  venta: ["/api/ventas"],
  manoobra_venta: ["/api/ventas", "/api/manoobra", "/api/trabajadores"],
  credito: ["/api/creditos"],
  compra: ["/api/compras"],
};

export async function procesarPendientes() {
  if (sincronizando || !navigator.onLine) return;
  sincronizando = true;

  try {
    const pendientes = await listarPendientes();
    if (!pendientes.length) return;

    let exitosas = 0;
    const queryKeysAfectados = new Set<string>();

    for (const op of pendientes) {
      try {
        const res = await fetch(`${API}${op.endpoint}`, {
          method: op.metodo,
          headers: { "Content-Type": "application/json", "X-Operation-Id": op.operationId },
          body: JSON.stringify(op.payload),
        });

        if (res.ok) {
          await marcarSincronizada(op.operationId);
          exitosas++;
          (QUERY_KEYS_POR_TIPO[op.tipo] || []).forEach((k) => queryKeysAfectados.add(k));
        } else {
          // Error del servidor (no de red) — no se reintenta en bucle infinito, se deja para revisión
          break;
        }
      } catch {
        // Error de red real — probablemente se volvió a caer la conexión, se detiene el lote
        break;
      }
    }

    queryKeysAfectados.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));

    if (exitosas > 0) {
      toast({
        title: "Sincronización completa",
        description: `Se guardaron correctamente ${exitosas} operación${exitosas === 1 ? "" : "es"} pendiente${exitosas === 1 ? "" : "s"} en la base de datos.`,
      });
    }
  } finally {
    sincronizando = false;
  }
}

export function iniciarSincronizacionAutomatica() {
  // Solicita almacenamiento persistente (protege IndexedDB del borrado automático)
  if (navigator.storage?.persist) {
    navigator.storage.persist();
  }

  window.addEventListener("online", () => { procesarPendientes(); });

  // Reintento periódico de respaldo, por si el evento "online" no se dispara bien
  setInterval(() => { procesarPendientes(); }, 30_000);

  // Intento inicial al cargar la app
  procesarPendientes();
}