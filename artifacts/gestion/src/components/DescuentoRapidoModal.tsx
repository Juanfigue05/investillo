import { useState } from "react";
import { formatNumberCO, parseNumberCO } from "@/lib/utils";
import { X } from "lucide-react";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+$/g, "").replace(/\/+/g, "/");
const MOTIVOS = ["Producto dañado", "Arreglo para trabajador", "Pérdida", "Consumo interno", "Producto vencido", "Otro"];
type Producto = { id: number; nombre: string; codigo: string; stockLocal?: number; stockBodega?: number };

function necesitaConfirmacion(texto: string) {
  const limpio = texto.replace(/[\s'$]/g, "");
  const partes = limpio.split(".");
  return !limpio.includes(",") && partes.length === 2 && partes[1].length === 3;
}

export function DescuentoRapidoModal({ productos, onClose, onSaved }: { productos: Producto[]; onClose: () => void; onSaved: () => void }) {
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [motivoOtro, setMotivoOtro] = useState("");
  const [observacion, setObservacion] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const producto = productos.find((item) => String(item.id) === productoId);

  const guardar = async () => {
    setError("");
    if (!productoId || !cantidad.trim()) { setError("Selecciona un producto e ingresa una cantidad."); return; }
    if (motivo === "Otro" && !motivoOtro.trim()) { setError("Especifica el motivo."); return; }
    if (necesitaConfirmacion(cantidad) && !confirmado) { setError("Confirma la interpretación de la cantidad."); return; }
    setGuardando(true);
    try {
      const response = await fetch(`${API}/descuentos-inventario`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo, motivoOtro, observacion, items: [{ productoId: Number(productoId), cantidad: parseNumberCO(cantidad) }] }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo registrar el descuento");
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo registrar el descuento"); }
    finally { setGuardando(false); }
  };

  return <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Descuento de inventario</h2><button onClick={onClose} title="Cerrar"><X className="w-5 h-5" /></button></div>
      <label className="block text-sm">Producto<select value={productoId} onChange={(event) => setProductoId(event.target.value)} className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2"><option value="">Selecciona un producto</option>{productos.map((item) => <option key={item.id} value={item.id}>{item.nombre} [{item.codigo}]</option>)}</select></label>
      {producto && <p className="text-xs text-muted-foreground">Local: {producto.stockLocal ?? 0} · Bodega: {producto.stockBodega ?? 0}</p>}
      <label className="block text-sm">Cantidad<input value={cantidad} onChange={(event) => setCantidad(event.target.value)} placeholder="0,25" inputMode="decimal" className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2" />{cantidad.trim() && <span className="text-xs text-muted-foreground">Se interpretará como: <strong>{formatNumberCO(parseNumberCO(cantidad))}</strong></span>}</label>
      {necesitaConfirmacion(cantidad) && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={confirmado} onChange={(event) => setConfirmado(event.target.checked)} /> Confirmo esta interpretación</label>}
      <label className="block text-sm">Motivo<select value={motivo} onChange={(event) => setMotivo(event.target.value)} className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2">{MOTIVOS.map((item) => <option key={item}>{item}</option>)}</select></label>
      {motivo === "Otro" && <label className="block text-sm">Especifica el motivo<input value={motivoOtro} onChange={(event) => setMotivoOtro(event.target.value)} className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2" /></label>}
      <label className="block text-sm">Observación (opcional)<textarea value={observacion} onChange={(event) => setObservacion(event.target.value)} rows={2} className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2" /></label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 rounded-lg bg-muted">Cancelar</button><button onClick={() => void guardar()} disabled={guardando} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50">{guardando ? "Guardando..." : "Descontar"}</button></div>
    </div>
  </div>;
}
