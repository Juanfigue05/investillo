import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { formatCurrency, parseNumberCO } from "@/lib/utils";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+$/g, "").replace(/\/+/g, "/");
type Producto = { id: number; nombre: string; codigo: string; marca?: string | null; precioCompra: number; precioVentaSinIva: number };
type Trabajador = { id: number; nombre: string };
type TipoServicio = "Mano de Obra" | "Soldadura" | "Chispeada" | "Pulida";
type Fila = { id: number; tipoServicio: TipoServicio | null; productoId: string; nombre: string; marca: string; cantidad: string; precioCompra: string; precioVenta: string; trabajadores: number[] };

function nuevaFila(id: number): Fila { return { id, tipoServicio: null, productoId: "", nombre: "", marca: "", cantidad: "1", precioCompra: "0", precioVenta: "", trabajadores: [] }; }

export function PagoCreditoAntiguoModal({ fecha, productos, trabajadores, onClose, onSaved }: { fecha: string; productos: Producto[]; trabajadores: Trabajador[]; onClose: () => void; onSaved: () => void }) {
  const [referencia, setReferencia] = useState("");
  const [formaPago, setFormaPago] = useState("efectivo");
  const [observacion, setObservacion] = useState("");
  const [filas, setFilas] = useState<Fila[]>([nuevaFila(1)]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const actualizar = (id: number, cambios: Partial<Fila>) => setFilas((actuales) => actuales.map((fila) => fila.id === id ? { ...fila, ...cambios } : fila));
  const seleccionarProducto = (fila: Fila, productoId: string) => {
    const producto = productos.find((item) => String(item.id) === productoId);
    actualizar(fila.id, producto ? { productoId, tipoServicio: null, nombre: producto.nombre, marca: producto.marca || "", precioCompra: String(producto.precioCompra), precioVenta: String(producto.precioVentaSinIva), trabajadores: [] } : { productoId: "", nombre: "", marca: "", precioCompra: "0", precioVenta: "" });
  };
  const seleccionarServicio = (fila: Fila, tipoServicio: TipoServicio | null) => {
    actualizar(fila.id, {
      tipoServicio,
      productoId: "",
      nombre: tipoServicio || "",
      marca: "",
      precioCompra: "0",
      precioVenta: "",
      trabajadores: [],
    });
  };
  const guardar = async () => {
    setError("");
    if (!referencia.trim()) { setError("Ingresa la referencia del crédito antiguo."); return; }
    if (filas.some((fila) => !fila.nombre.trim() || !fila.precioVenta.trim() || parseNumberCO(fila.cantidad) <= 0)) { setError("Completa producto, cantidad y precio de venta en todas las filas."); return; }
    if (filas.some((fila) => fila.tipoServicio && fila.trabajadores.length === 0)) { setError("Selecciona al menos un empleado para cada servicio."); return; }
    setGuardando(true);
    try {
      const response = await fetch(`${API}/ventas/lote-pago-antiguo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: filas.map((fila) => ({ fecha, referencia: referencia.trim(), tipoLinea: fila.tipoServicio ? "manoobra" : "venta", productoId: fila.tipoServicio ? undefined : Number(fila.productoId) || undefined, productoNombre: fila.nombre.trim(), productoCodigo: fila.tipoServicio ? undefined : productos.find((p) => String(p.id) === fila.productoId)?.codigo, productoMarca: fila.tipoServicio ? trabajadores.filter((t) => fila.trabajadores.includes(t.id)).map((t) => t.nombre).join(", ") : fila.marca, cantidad: parseNumberCO(fila.cantidad), precioCompraUnidad: parseNumberCO(fila.precioCompra), precioVentaUnidad: parseNumberCO(fila.precioVenta), precioVentaTotal: parseNumberCO(fila.cantidad) * parseNumberCO(fila.precioVenta), beneficio: fila.tipoServicio ? parseNumberCO(fila.precioVenta) * parseNumberCO(fila.cantidad) : (parseNumberCO(fila.precioVenta) - parseNumberCO(fila.precioCompra)) * parseNumberCO(fila.cantidad), descripcion: observacion.trim() || "Pago de crédito antiguo", formaPago })) }) });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "No se pudo guardar el lote");
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar"); }
    finally { setGuardando(false); }
  };

  return <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}><div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-y-auto p-6 space-y-4" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Registrar pago de crédito antiguo</h2><p className="text-xs text-muted-foreground">Se agrega a Ventas Diarias y no modifica el inventario.</p></div><button onClick={onClose} title="Cerrar"><X className="w-5 h-5" /></button></div><div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Referencia<input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="No. crédito o remisión" className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2" /></label><label className="text-sm">Forma de pago<select value={formaPago} onChange={(e) => setFormaPago(e.target.value)} className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2"><option value="efectivo">Efectivo</option><option value="cuenta_ernesto">Cuenta Ernesto</option><option value="cuenta_olga">Cuenta Olga</option><option value="cuenta_juan">Cuenta Juan</option></select></label><label className="text-sm">Observación (opcional)<input value={observacion} onChange={(e) => setObservacion(e.target.value)} className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2" /></label></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="bg-muted text-left"><th className="p-2">Tipo / producto</th><th className="p-2">Marca / empleados</th><th className="p-2">Cantidad</th><th className="p-2">P. compra</th><th className="p-2">P. venta</th><th className="p-2">Total</th><th className="p-2" /></tr></thead><tbody>{filas.map((fila) => <tr key={fila.id} className={`border-t border-border align-top ${fila.tipoServicio ? "row-manoobra" : ""}`}><td className="p-2"><select value={fila.tipoServicio || ""} onChange={(e) => seleccionarServicio(fila, (e.target.value || null) as TipoServicio | null)} className="w-full bg-background border border-yellow-500/50 rounded-lg px-2 py-1.5 text-xs"><option value="">Producto de inventario</option><option value="Mano de Obra">Mano de Obra</option><option value="Soldadura">Soldadura</option><option value="Chispeada">Chispeada</option><option value="Pulida">Pulida</option></select>{fila.tipoServicio ? <input value={fila.nombre} onChange={(e) => actualizar(fila.id, { nombre: e.target.value })} placeholder="Concepto del servicio" className="w-full mt-1 bg-background border border-border rounded-lg px-2 py-1.5" /> : <select value={fila.productoId} onChange={(e) => seleccionarProducto(fila, e.target.value)} className="w-full mt-1 bg-background border border-border rounded-lg px-2 py-1.5"><option value="">Seleccionar producto</option>{productos.map((p) => <option key={p.id} value={p.id}>{p.nombre} [{p.codigo}]</option>)}</select>}</td><td className="p-2">{fila.tipoServicio ? <div className="space-y-1">{trabajadores.map((t) => <label key={t.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={fila.trabajadores.includes(t.id)} onChange={(e) => actualizar(fila.id, { trabajadores: e.target.checked ? [...fila.trabajadores, t.id] : fila.trabajadores.filter((id) => id !== t.id) })} />{t.nombre}</label>)}</div> : <input value={fila.marca} onChange={(e) => actualizar(fila.id, { marca: e.target.value })} placeholder="Marca" className="w-28 bg-background border border-border rounded-lg px-2 py-1.5" />}</td><td className="p-2"><input value={fila.cantidad} onChange={(e) => actualizar(fila.id, { cantidad: e.target.value })} className="w-20 bg-background border border-border rounded-lg px-2 py-1.5" /></td><td className="p-2"><input value={fila.precioCompra} onChange={(e) => actualizar(fila.id, { precioCompra: e.target.value })} className="w-28 bg-background border border-border rounded-lg px-2 py-1.5" /></td><td className="p-2"><input value={fila.precioVenta} onChange={(e) => actualizar(fila.id, { precioVenta: e.target.value })} className="w-28 bg-background border border-border rounded-lg px-2 py-1.5" /></td><td className="p-2 font-semibold">{formatCurrency(parseNumberCO(fila.cantidad) * parseNumberCO(fila.precioVenta))}</td><td className="p-2"><button onClick={() => setFilas((actuales) => actuales.length > 1 ? actuales.filter((item) => item.id !== fila.id) : actuales)} title="Eliminar fila"><Trash2 className="w-4 h-4 text-destructive" /></button></td></tr>)}</tbody></table></div><button onClick={() => setFilas((actuales) => [...actuales, nuevaFila(Date.now())])} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-sm"><Plus className="w-4 h-4" /> Agregar fila</button>{error && <p className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 rounded-lg bg-muted">Cancelar</button><button onClick={() => void guardar()} disabled={guardando} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50">{guardando ? "Guardando..." : "Guardar pagos"}</button></div></div></div>;
}
