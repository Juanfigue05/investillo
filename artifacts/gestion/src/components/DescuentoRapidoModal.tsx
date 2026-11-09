import { useState } from "react";
import { formatNumberCO, parseNumberCO } from "@/lib/utils";
import { MinusCircle, PlusCircle, X } from "lucide-react";
import { OperacionEncoladaOfflineError } from "@/lib/offline-db";
import { toast } from "@/hooks/use-toast";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+$/g, "").replace(/\/+/g, "/");
const MOTIVOS_DESCUENTO = [
  "Producto dañado",
  "Arreglo para trabajador",
  "Pérdida",
  "Consumo interno",
  "Producto vencido",
  "Otro",
];
const MOTIVOS_AJUSTE = [
  { value: "conteo", label: "Conteo físico" },
  { value: "danado", label: "Se dañó (resta)" },
  { value: "devolucion_fabrica", label: "Devolución a fábrica (resta)" },
  { value: "perdida_robo", label: "Pérdida o robo (resta)" },
  { value: "entrada_extra", label: "Entrada extra (suma)" },
  { value: "otro", label: "Otro" },
] as const;
type Accion = "ajuste" | "descuento";
type Producto = {
  id: number;
  nombre: string;
  codigo: string;
  stockActual?: number;
  stockLocal?: number;
  stockBodega?: number;
};

function necesitaConfirmacion(texto: string) {
  const limpio = texto.replace(/[\s'$]/g, "");
  const partes = limpio.split(".");
  return !limpio.includes(",") && partes.length === 2 && partes[1].length === 3;
}

export function DescuentoRapidoModal({
  productos,
  onClose,
  onSaved,
}: {
  productos: Producto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [accion, setAccion] = useState<Accion>("ajuste");
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [ubicacion, setUbicacion] = useState<"local" | "bodega">("local");
  const [direccion, setDireccion] = useState<"sumar" | "restar">("sumar");
  const [motivoAjuste, setMotivoAjuste] = useState<(typeof MOTIVOS_AJUSTE)[number]["value"]>("conteo");
  const [motivoDescuento, setMotivoDescuento] = useState(MOTIVOS_DESCUENTO[0]);
  const [motivoOtro, setMotivoOtro] = useState("");
  const [observacion, setObservacion] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const producto = productos.find((item) => String(item.id) === productoId);
  const cantidadNumerica = cantidad.trim() ? parseNumberCO(cantidad) : 0;
  const stockLocalRegistrado = producto?.stockLocal ?? 0;
  const stockBodegaRegistrado = producto?.stockBodega ?? 0;
  const stockLocal =
    stockLocalRegistrado === 0 &&
    stockBodegaRegistrado === 0 &&
    (producto?.stockActual ?? 0) !== 0
      ? producto!.stockActual!
      : stockLocalRegistrado;
  const stockBodega = stockBodegaRegistrado;
  const cambio = accion === "descuento"
    ? -cantidadNumerica
    : direccion === "sumar"
      ? cantidadNumerica
      : -cantidadNumerica;
  const stockUbicacion = ubicacion === "local" ? stockLocal : stockBodega;
  const stockDespues = stockUbicacion + cambio;
  const totalDespues = stockLocal + stockBodega + cambio;
  const stockInsuficiente =
    accion === "descuento"
      ? cantidadNumerica > stockLocal + stockBodega
      : stockDespues < 0;
  const motivoTieneDireccionFija = [
    "danado",
    "devolucion_fabrica",
    "perdida_robo",
    "entrada_extra",
  ].includes(motivoAjuste);

  const guardar = async () => {
    setError("");
    if (!productoId || !cantidad.trim()) {
      setError("Selecciona un producto e ingresa una cantidad.");
      return;
    }
    if (!Number.isFinite(cantidadNumerica) || cantidadNumerica <= 0) {
      setError("Ingresa una cantidad válida mayor que cero.");
      return;
    }
    if (necesitaConfirmacion(cantidad) && !confirmado) {
      setError("Confirma la interpretación de la cantidad.");
      return;
    }
    if (stockInsuficiente) {
      if (accion === "descuento") {
        setError("No hay existencias suficientes en el inventario.");
        return;
      }
      setError(`No hay existencias suficientes en ${ubicacion === "local" ? "Local" : "Bodega"}.`);
      return;
    }
    if (
      accion === "descuento" &&
      (cantidadNumerica < 0.25 ||
        cantidadNumerica > 10 ||
        Math.abs(cantidadNumerica * 4 - Math.round(cantidadNumerica * 4)) > 0.0001)
    ) {
      setError("El descuento debe ser entre 0,25 y 10, en pasos de 0,25.");
      return;
    }
    if (accion === "descuento" && motivoDescuento === "Otro" && !motivoOtro.trim()) {
      setError("Especifica el motivo.");
      return;
    }
    if (accion === "ajuste" && motivoAjuste === "otro" && !motivoOtro.trim()) {
      setError("Especifica el motivo.");
      return;
    }

    setGuardando(true);
    try {
      const response = accion === "ajuste"
        ? await fetch(`${API}/inventario/${productoId}/ajustes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ubicacion,
              direccion,
              cantidad: cantidadNumerica,
              motivo: motivoAjuste,
              motivoOtro,
              observacion,
            }),
          })
        : await fetch(`${API}/descuentos-inventario`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              motivo: motivoDescuento,
              motivoOtro,
              observacion,
              items: [{ productoId: Number(productoId), cantidad: cantidadNumerica }],
            }),
          });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar el movimiento");
      onSaved();
    } catch (err) {
      if (err instanceof OperacionEncoladaOfflineError) {
        toast({
          title: "Movimiento guardado en este dispositivo",
          description: "Se sincronizará cuando vuelva la conexión.",
        });
        onSaved();
        return;
      }
      setError(err instanceof Error ? err.message : "No se pudo guardar el movimiento");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Movimiento de inventario</h2>
            <p className="text-xs text-muted-foreground">Cada cambio queda registrado en el historial.</p>
          </div>
          <button onClick={onClose} title="Cerrar"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => { setAccion("ajuste"); setError(""); }}
            className={`rounded-md px-3 py-2 text-sm font-medium ${accion === "ajuste" ? "bg-background shadow" : "text-muted-foreground"}`}
          >
            Ajuste físico
          </button>
          <button
            type="button"
            onClick={() => { setAccion("descuento"); setError(""); }}
            className={`rounded-md px-3 py-2 text-sm font-medium ${accion === "descuento" ? "bg-background shadow" : "text-muted-foreground"}`}
          >
            Descontar
          </button>
        </div>

        <label className="block text-sm">
          Producto
          <select
            value={productoId}
            onChange={(event) => setProductoId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
          >
            <option value="">Selecciona un producto</option>
            {productos.map((item) => (
              <option key={item.id} value={item.id}>{item.nombre} [{item.codigo}]</option>
            ))}
          </select>
        </label>

        {producto && (
          <div className="rounded-lg border border-border bg-background p-3 text-sm">
            <p>Stock actual: <strong>{formatNumberCO(stockLocal + stockBodega)}</strong></p>
            <p className="text-xs text-muted-foreground">
              Local: {formatNumberCO(stockLocal)} · Bodega: {formatNumberCO(stockBodega)}
            </p>
          </div>
        )}

        {accion === "ajuste" && (
          <>
            <label className="block text-sm">
              Ubicación
              <select value={ubicacion} onChange={(event) => setUbicacion(event.target.value as "local" | "bodega")} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2">
                <option value="local">Local</option>
                <option value="bodega">Bodega</option>
              </select>
            </label>
            <label className="block text-sm">
              Motivo
              <select
                value={motivoAjuste}
                onChange={(event) => {
                  const nuevoMotivo = event.target.value as typeof motivoAjuste;
                  setMotivoAjuste(nuevoMotivo);
                  if (nuevoMotivo === "danado" || nuevoMotivo === "devolucion_fabrica" || nuevoMotivo === "perdida_robo") setDireccion("restar");
                  if (nuevoMotivo === "entrada_extra") setDireccion("sumar");
                }}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
              >
                {MOTIVOS_AJUSTE.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            {!motivoTieneDireccionFija && (
              <label className="block text-sm">
                Conteo físico
                <select value={direccion} onChange={(event) => setDireccion(event.target.value as "sumar" | "restar")} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2">
                  <option value="sumar">Sobraron (sumar)</option>
                  <option value="restar">Faltaron (restar)</option>
                </select>
              </label>
            )}
          </>
        )}

        {accion === "descuento" && (
          <label className="block text-sm">
            Motivo del descuento
            <select value={motivoDescuento} onChange={(event) => setMotivoDescuento(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2">
              {MOTIVOS_DESCUENTO.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        )}

        <label className="block text-sm">
          Cantidad
          <input value={cantidad} onChange={(event) => { setCantidad(event.target.value); setConfirmado(false); }} placeholder="0,25" inputMode="decimal" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" />
          {cantidad.trim() && <span className="text-xs text-muted-foreground">Se interpretará como: <strong>{formatNumberCO(cantidadNumerica)}</strong></span>}
        </label>

        {accion === "ajuste" && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            Vista previa: {formatNumberCO(stockUbicacion)} → <strong>{formatNumberCO(stockDespues)}</strong> en {ubicacion === "local" ? "Local" : "Bodega"}.
            <span className="block text-xs text-muted-foreground">Total: {formatNumberCO(stockLocal + stockBodega)} → {formatNumberCO(totalDespues)}</span>
          </div>
        )}
        {accion === "descuento" && producto && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            Descuento de {formatNumberCO(cantidadNumerica)} unidades desde Local y, si hace falta, Bodega.
            <span className="block text-xs text-muted-foreground">Total: {formatNumberCO(stockLocal + stockBodega)} → {formatNumberCO(totalDespues)}</span>
          </div>
        )}

        {necesitaConfirmacion(cantidad) && (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={confirmado} onChange={(event) => setConfirmado(event.target.checked)} />
            Confirmo esta interpretación
          </label>
        )}
        {((accion === "ajuste" && motivoAjuste === "otro") || (accion === "descuento" && motivoDescuento === "Otro")) && (
          <label className="block text-sm">
            Especifica el motivo
            <input value={motivoOtro} onChange={(event) => setMotivoOtro(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" />
          </label>
        )}
        <label className="block text-sm">
          Observación (opcional)
          <textarea value={observacion} onChange={(event) => setObservacion(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg bg-muted px-4 py-2">Cancelar</button>
          <button onClick={() => void guardar()} disabled={guardando || stockInsuficiente} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">
            {accion === "ajuste" ? <PlusCircle className="h-4 w-4" /> : <MinusCircle className="h-4 w-4" />}
            {guardando ? "Guardando..." : accion === "ajuste" ? "Guardar ajuste" : "Descontar"}
          </button>
        </div>
      </div>
    </div>
  );
}
