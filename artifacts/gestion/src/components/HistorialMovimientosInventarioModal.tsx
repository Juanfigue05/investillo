import { useEffect, useState } from "react";
import { formatNumberCO } from "@/lib/utils";
import { X } from "lucide-react";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+$/g, "").replace(/\/+/g, "/");

type Movimiento = {
  id: number;
  productoNombre: string;
  productoCodigo: string;
  tipo: string;
  motivo: string;
  ubicacion: string;
  direccion: string;
  cantidad: number;
  stockActualAntes: number;
  stockActualDespues: number;
  observacion: string | null;
  creadoEn: string;
};

function etiquetaMotivo(motivo: string) {
  const etiquetas: Record<string, string> = {
    conteo: "Conteo físico",
    danado: "Producto dañado",
    devolucion_fabrica: "Devolución a fábrica",
    perdida_robo: "Pérdida o robo",
    entrada_extra: "Entrada extra",
    compra_llegada: "Llegada de compra",
    correccion_compra: "Corrección de compra",
    reversion_compra: "Reversión de compra",
    traslado: "Traslado",
    reversion_descuento: "Reversión de descuento",
    correccion_descuento: "Corrección de descuento",
  };
  return etiquetas[motivo] ?? motivo;
}

export function HistorialMovimientosInventarioModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelado = false;
    fetch(`${API}/inventario/movimientos`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudo cargar el historial.");
        if (!Array.isArray(data)) throw new Error("Respuesta inválida del historial.");
        if (!cancelado) setMovimientos(data as Movimiento[]);
      })
      .catch((err: unknown) => {
        if (!cancelado) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <h2 className="text-lg font-bold">Movimientos sin venta</h2>
            <p className="text-xs text-muted-foreground">Últimos 100 ajustes, descuentos, traslados y movimientos de compra.</p>
          </div>
          <button onClick={onClose} title="Cerrar"><X className="h-5 w-5" /></button>
        </div>
        {cargando ? (
          <p className="p-6 text-sm text-muted-foreground">Cargando movimientos...</p>
        ) : error ? (
          <p className="p-6 text-sm text-destructive">{error}</p>
        ) : movimientos.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Todavía no hay movimientos registrados.</p>
        ) : (
          <div className="overflow-auto p-4">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Fecha</th>
                  <th className="p-2">Producto</th>
                  <th className="p-2">Motivo</th>
                  <th className="p-2">Cambio</th>
                  <th className="p-2">Total</th>
                  <th className="p-2">Observación</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((movimiento) => (
                  <tr key={movimiento.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap p-2 text-xs">
                      {new Date(movimiento.creadoEn).toLocaleString("es-CO")}
                    </td>
                    <td className="p-2">
                      <strong>{movimiento.productoNombre}</strong>
                      <span className="block text-xs text-muted-foreground">{movimiento.productoCodigo}</span>
                    </td>
                    <td className="p-2">{etiquetaMotivo(movimiento.motivo)}</td>
                    <td className="p-2">
                      {movimiento.direccion === "sumar" ? "+" : "−"}
                      {formatNumberCO(movimiento.cantidad)} · {movimiento.ubicacion}
                    </td>
                    <td className="whitespace-nowrap p-2">
                      {formatNumberCO(movimiento.stockActualAntes)} → {formatNumberCO(movimiento.stockActualDespues)}
                    </td>
                    <td className="max-w-56 p-2 text-xs text-muted-foreground">{movimiento.observacion || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end border-t border-border p-4">
          <button onClick={onClose} className="rounded-lg bg-muted px-4 py-2">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
