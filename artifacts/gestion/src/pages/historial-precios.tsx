import { useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { useGetHistorialPrecios } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Eye, Search, Trash2, TrendingDown, TrendingUp, X, Minus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+$/g, "").replace(/\/+/g, "/");
type Registro = {
  id: number; productoId: number; productoNombre: string; productoCodigo?: string | null; marca?: string | null;
  precioCompra: number; precioVenta: number; fecha: string; origen: string; proveedor?: string | null; actualizoPrecioInventario?: string | null;
};

function porcentaje(entries: Registro[]) {
  if (entries.length < 2 || entries[entries.length - 1].precioCompra === 0) return null;
  const cambio = ((entries[0].precioCompra - entries[entries.length - 1].precioCompra) / entries[entries.length - 1].precioCompra) * 100;
  const Icon = cambio > 0.5 ? TrendingUp : cambio < -0.5 ? TrendingDown : Minus;
  const clase = cambio > 0.5 ? "bg-destructive/10 text-destructive" : cambio < -0.5 ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground";
  return <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${clase}`}><Icon className="w-3 h-3" />{Math.abs(cambio).toFixed(1)}%</span>;
}

export default function HistorialPreciosPage() {
  const { data: registros, isLoading } = useGetHistorialPrecios();
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState("");
  const [seleccionado, setSeleccionado] = useState<Registro[] | null>(null);
  const [confirmar, setConfirmar] = useState<Registro[] | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const porProducto = useMemo(() => {
    const mapa = new Map<number, Registro[]>();
    for (const registro of (registros || []) as Registro[]) {
      if (busqueda && !`${registro.productoNombre} ${registro.productoCodigo || ""} ${registro.marca || ""}`.toLowerCase().includes(busqueda.toLowerCase())) continue;
      if (!mapa.has(registro.productoId)) mapa.set(registro.productoId, []);
      mapa.get(registro.productoId)!.push(registro);
    }
    for (const entries of mapa.values()) entries.sort((a, b) => b.fecha.localeCompare(a.fecha));
    return [...mapa.values()].sort((a, b) => b[0].fecha.localeCompare(a[0].fecha));
  }, [registros, busqueda]);
  const eliminarHistorial = async () => {
    if (!confirmar?.[0]) return;
    setEliminando(true);
    try {
      const response = await fetch(`${API}/historial-precios/producto/${confirmar[0].productoId}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await response.text());
      await queryClient.invalidateQueries({ queryKey: ["/api/historial-precios"] });
      setConfirmar(null);
    } catch { alert("No se pudo eliminar el historial del producto"); }
    finally { setEliminando(false); }
  };
  return <Layout><div className="space-y-5">
    <div><h1 className="text-2xl font-display font-bold text-foreground">Historial de Precios</h1><p className="text-muted-foreground mt-1 text-sm">Un registro por producto. Abre el ojo para consultar sus cambios de precio.</p></div>
    <div className="relative max-w-xl"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto, código o marca..." className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" /></div>
    {isLoading ? <div className="text-center py-12 text-muted-foreground">Cargando historial...</div> : porProducto.length === 0 ? <div className="text-center py-12 bg-card rounded-xl border border-border text-muted-foreground">No hay registros de precios aún.</div> : <div className="bg-card border border-border rounded-xl overflow-hidden shadow-lg"><div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr className="bg-muted text-muted-foreground border-b border-border text-xs"><th className="px-4 py-3 font-medium">Producto</th><th className="px-4 py-3 font-medium">Marca</th><th className="px-4 py-3 font-medium">P. Compra</th><th className="px-4 py-3 font-medium">P. Venta</th><th className="px-4 py-3 font-medium">Proveedor</th><th className="px-4 py-3 font-medium text-right">Acciones</th></tr></thead><tbody className="divide-y divide-border">{porProducto.map((entries) => { const ultimo = entries[0]; return <tr key={ultimo.productoId} className="hover:bg-muted/30"><td className="px-4 py-3"><div className="font-semibold">{ultimo.productoNombre}</div><div className="text-xs text-muted-foreground font-mono">{ultimo.productoCodigo || "—"}</div></td><td className="px-4 py-3 text-muted-foreground">{ultimo.marca || "—"}</td><td className="px-4 py-3 font-mono font-semibold">{formatCurrency(ultimo.precioCompra)}</td><td className="px-4 py-3 text-primary font-mono font-semibold">{formatCurrency(ultimo.precioVenta)}</td><td className="px-4 py-3 text-muted-foreground">{ultimo.proveedor || "—"}</td><td className="px-4 py-3"><div className="flex items-center justify-end gap-2"><span>{porcentaje(entries)}</span><button onClick={() => setSeleccionado(entries)} title="Ver historial del producto" className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"><Eye className="w-4 h-4" /></button><button onClick={() => setConfirmar(entries)} title="Eliminar historial del producto" className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></button></div></td></tr>; })}</tbody></table></div></div>}
  </div>
  {seleccionado && <div className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center" onClick={() => setSeleccionado(null)}><div className="w-full max-w-5xl max-h-[90vh] overflow-hidden bg-card border border-border rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="p-5 border-b border-border flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">{seleccionado[0].productoNombre}</h2><p className="text-xs text-muted-foreground font-mono">{seleccionado[0].productoCodigo || "—"}</p></div><div className="flex items-start gap-5"><div className="text-right"><p className="text-xs text-muted-foreground">Último P. Compra</p><p className="font-bold">{formatCurrency(seleccionado[0].precioCompra)}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Último P. Venta</p><p className="font-bold text-primary">{formatCurrency(seleccionado[0].precioVenta)}</p></div>{porcentaje(seleccionado)}<button onClick={() => setSeleccionado(null)} title="Cerrar"><X className="w-5 h-5" /></button></div></div><div className="overflow-auto max-h-[calc(90vh-110px)]"><table className="w-full text-sm text-left"><thead className="sticky top-0"><tr className="bg-muted text-muted-foreground border-b border-border text-xs"><th className="px-4 py-3 font-medium">Fecha</th><th className="px-4 py-3 font-medium">P. Compra</th><th className="px-4 py-3 font-medium">P. Venta</th><th className="px-4 py-3 font-medium">Proveedor</th><th className="px-4 py-3 font-medium">Origen</th><th className="px-4 py-3 font-medium">Actualizó inventario</th></tr></thead><tbody className="divide-y divide-border">{seleccionado.map((registro, index) => <tr key={registro.id}><td className="px-4 py-3 whitespace-nowrap">{new Date(registro.fecha + "T12:00:00").toLocaleDateString("es-CO")}{index === 0 && <span className="ml-2 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Último</span>}</td><td className="px-4 py-3 font-mono">{formatCurrency(registro.precioCompra)}</td><td className="px-4 py-3 text-primary font-mono">{formatCurrency(registro.precioVenta)}</td><td className="px-4 py-3 text-muted-foreground">{registro.proveedor || "—"}</td><td className="px-4 py-3"><span className="text-xs px-2 py-1 rounded-full bg-muted capitalize">{registro.origen}</span></td><td className="px-4 py-3">{registro.actualizoPrecioInventario === "si" ? <span className="text-green-500">✓ Sí</span> : <span className="text-muted-foreground">No</span>}</td></tr>)}</tbody></table></div></div></div>}
  {confirmar && <div className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center" onClick={() => !eliminando && setConfirmar(null)}><div className="w-full max-w-md bg-card border border-border rounded-xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}><h2 className="text-lg font-bold">Eliminar historial de precios</h2><p className="text-sm text-muted-foreground mt-2">Se eliminarán <strong className="text-foreground">{confirmar.length} registros</strong> de <strong className="text-foreground">{confirmar[0].productoNombre}</strong>.</p><p className="text-xs text-muted-foreground mt-2">El inventario y las compras no tendrán ningún cambio.</p><div className="flex justify-end gap-2 mt-6"><button disabled={eliminando} onClick={() => setConfirmar(null)} className="px-4 py-2 rounded-lg bg-muted text-sm">Cancelar</button><button disabled={eliminando} onClick={eliminarHistorial} className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium">{eliminando ? "Eliminando..." : "Eliminar historial"}</button></div></div></div>}
  </Layout>;
}
