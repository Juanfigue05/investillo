import {
  listarPendientes,
  marcarConError,
  marcarSincronizada,
  OperacionEncoladaOfflineError,
} from "./offline-db";
import { reconstruirCuerpoOffline } from "./offline-fetch";
import { queryClient } from "./queryClient";
import { toast } from "@/hooks/use-toast";

const API = "/api";

let sincronizando = false;

const QUERY_KEYS_POR_TIPO: Record<string, string[]> = {
  venta: ["/api/ventas", "/api/inventario"],
  venta_lote_pago_antiguo: ["/api/ventas"],
  manoobra_venta: ["/api/ventas", "/api/manoobra", "/api/trabajadores"],
  credito: ["/api/creditos", "/api/ventas", "/api/trabajadores", "/api/inventario"],
  compra: ["/api/compras", "/api/inventario", "/api/historial-precios"],
  cierre_diario: ["/api/cierre-diario", "/api/trabajadores"],
  producto: ["/api/inventario"],
  cliente: ["/api/clientes"],
  trabajador: ["/api/trabajadores"],
  manoobra: ["/api/manoobra", "/api/ventas"],
  descuento_inventario: ["/api/descuentos-inventario", "/api/inventario"],
  grupo_trabajo: ["/api/grupos-trabajo"],
  historial: ["/api/historial"],
  historial_precio: ["/api/historial-precios"],
  obra_electronica: ["/api/obra-electronica"],
  preferencia: ["/api/preferencias"],
  remachada: ["/api/remachadas"],
  tensionada: ["/api/tensionadas"],
  nota: ["/api/notas"],
  calculadora_cierre: ["/api/calculadora-cierre"],
  conteo_monedas: ["/api/conteo-monedas"],
  reporte: ["/api/reportes/nomina", "/api/tensionadas", "/api/trabajadores"],
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
        const requestBody = reconstruirCuerpoOffline(op.payload);
        const headers = new Headers({
          "X-Operation-Id": op.operationId,
        });
        if (requestBody.contentType) {
          headers.set("Content-Type", requestBody.contentType);
        }
        const res = await fetch(`${API}${op.endpoint}`, {
          method: op.metodo,
          headers,
          body: op.metodo === "DELETE" ? undefined : requestBody.body,
        });

        if (res.ok) {
          await marcarSincronizada(op.operationId);
          exitosas++;
          (QUERY_KEYS_POR_TIPO[op.tipo] || []).forEach((k) =>
            queryKeysAfectados.add(k),
          );
        } else {
          const detalle = await res.text().catch(() => "");
          await marcarConError(
            op.operationId,
            detalle || `El servidor respondió con HTTP ${res.status}.`,
          );
          toast({
            title: "No se pudo sincronizar una operación",
            description:
              detalle ||
              `El servidor respondió con HTTP ${res.status}. La operación sigue guardada en este dispositivo.`,
            variant: "destructive",
          });
          break;
        }
      } catch (error) {
        if (
          error instanceof OperacionEncoladaOfflineError ||
          !navigator.onLine ||
          error instanceof TypeError
        ) {
          break;
        }
        toast({
          title: "No se pudo completar la sincronización",
          description:
            error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
        break;
      }
    }

    queryKeysAfectados.forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k] }),
    );

    if (exitosas > 0) {
      toast({
        title: "Sincronización completa",
        description: `Se guardaron correctamente ${exitosas} operación${exitosas === 1 ? "" : "es"} pendiente${exitosas === 1 ? "" : "s"} en la base de datos.`,
      });
    }
  } catch (error) {
    toast({
      title: "No se pudo revisar la cola de sincronización",
      description: error instanceof Error ? error.message : String(error),
      variant: "destructive",
    });
  } finally {
    sincronizando = false;
  }
}

export function iniciarSincronizacionAutomatica() {
  // Solicita almacenamiento persistente (protege IndexedDB del borrado automático)
  if (navigator.storage?.persist) {
    navigator.storage.persist();
  }

  window.addEventListener("online", () => {
    procesarPendientes();
  });

  // Reintento periódico de respaldo, por si el evento "online" no se dispara bien
  setInterval(() => {
    procesarPendientes();
  }, 30_000);

  // Intento inicial al cargar la app
  procesarPendientes();
}
