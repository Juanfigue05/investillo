import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { useGetHistorialPrecios } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Search, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export default function HistorialPreciosPage() {
  const { data: registros, isLoading, refetch } = useGetHistorialPrecios();
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState("");
  const [productoFiltro, setProductoFiltro] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleDeleteEntry = async (id: number) => {
    if (!confirm("¿Eliminar este registro de precio?")) return;
    setDeletingId(id);
    try {
      await fetch(`${API}/historial-precios/${id}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["/api/historial-precios"] });
      refetch();
    } catch (e) {
      alert("Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  };

  // Unique products that have price history
  const productos = useMemo(() => {
    if (!registros) return [];
    const map = new Map<number, { id: number; nombre: string; codigo?: string | null }>();
    registros.forEach((r) => {
      if (!map.has(r.productoId)) {
        map.set(r.productoId, { id: r.productoId, nombre: r.productoNombre, codigo: r.productoCodigo });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [registros]);

  // Recent 10 products for chart (last purchase date)
  const productosRecientes = useMemo(() => {
    if (!registros) return [];
    const ultimo = new Map<number, { nombre: string; fecha: string }>();
    registros.forEach((r) => {
      const prev = ultimo.get(r.productoId);
      if (!prev || r.fecha > prev.fecha) {
        ultimo.set(r.productoId, { nombre: r.productoNombre, fecha: r.fecha });
      }
    });
    return Array.from(ultimo.entries())
      .sort((a, b) => b[1].fecha.localeCompare(a[1].fecha))
      .slice(0, 8)
      .map(([id]) => id);
  }, [registros]);

  // Chart data: for each of the recent products, build timeline data
  const chartData = useMemo(() => {
    if (!registros) return [];
    const byProducto = new Map<number, Array<{ fecha: string; precioCompra: number; precioVenta: number }>>();
    registros.forEach((r) => {
      if (!productosRecientes.includes(r.productoId)) return;
      if (!byProducto.has(r.productoId)) byProducto.set(r.productoId, []);
      byProducto.get(r.productoId)!.push({ fecha: r.fecha, precioCompra: r.precioCompra, precioVenta: r.precioVenta });
    });

    // Collect all dates
    const fechasSet = new Set<string>();
    byProducto.forEach((entries) => entries.forEach((e) => fechasSet.add(e.fecha)));
    const fechas = Array.from(fechasSet).sort();

    return fechas.map((fecha) => {
      const point: Record<string, unknown> = { fecha: fecha.slice(5) }; // MM-DD
      byProducto.forEach((entries, productoId) => {
        const entry = entries.find((e) => e.fecha === fecha);
        if (entry) {
          const name = registros.find((r) => r.productoId === productoId)?.productoNombre ?? `Prod ${productoId}`;
          const shortName = name.length > 12 ? name.slice(0, 12) + "…" : name;
          point[shortName + " (C)"] = entry.precioCompra;
          point[shortName + " (V)"] = entry.precioVenta;
        }
      });
      return point;
    });
  }, [registros, productosRecientes]);

  // Filtered list
  const filtrados = useMemo(() => {
    if (!registros) return [];
    return registros.filter((r) => {
      const matchBusqueda = !busqueda || r.productoNombre.toLowerCase().includes(busqueda.toLowerCase());
      const matchProducto = productoFiltro === null || r.productoId === productoFiltro;
      return matchBusqueda && matchProducto;
    });
  }, [registros, busqueda, productoFiltro]);

  // Group by product for list view
  const porProducto = useMemo(() => {
    const map = new Map<number, typeof filtrados>();
    filtrados.forEach((r) => {
      if (!map.has(r.productoId)) map.set(r.productoId, []);
      map.get(r.productoId)!.push(r);
    });
    // Sort each product's entries from newest to oldest
    map.forEach((entries) => entries.sort((a, b) => b.fecha.localeCompare(a.fecha)));
    // Sort products by their most recent entry
    return Array.from(map.entries()).sort((a, b) => b[1][0].fecha.localeCompare(a[1][0].fecha));
  }, [filtrados]);

  const COLORS = ["#3b82f6","#f59e0b","#10b981","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316"];

  const chartKeys = chartData.length > 0
    ? Object.keys(chartData[0]).filter((k) => k !== "fecha")
    : [];

  function pctChange(entries: typeof filtrados): { pct: number; dir: "up" | "down" | "same" } {
    if (entries.length < 2) return { pct: 0, dir: "same" };
    const latest = entries[0].precioCompra;
    const oldest = entries[entries.length - 1].precioCompra;
    if (oldest === 0) return { pct: 0, dir: "same" };
    const pct = ((latest - oldest) / oldest) * 100;
    return { pct: Math.abs(pct), dir: pct > 0.5 ? "up" : pct < -0.5 ? "down" : "same" };
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Historial de Precios</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Evolución de precios de productos según las compras recibidas.
          </p>
        </div>

        {/* Chart */}
        {chartData.length > 1 && (
          <div className="bg-card border border-border rounded-2xl p-5 shadow-xl">
            <h2 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">
              Tendencia de precios — 8 productos más recientes
            </h2>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12 }}
                  formatter={(v: number) => formatCurrency(v)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {chartKeys.map((key, i) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={COLORS[i % COLORS.length]}
                    dot={{ r: 3 }}
                    strokeWidth={2}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar producto..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
            />
          </div>
          <select
            value={productoFiltro ?? ""}
            onChange={(e) => setProductoFiltro(e.target.value ? parseInt(e.target.value) : null)}
            className="bg-card border border-border px-3 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none min-w-[200px]"
          >
            <option value="">Todos los productos</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>

        {/* Product list */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Cargando historial...</div>
        ) : porProducto.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-2xl border border-border">
            <TrendingUp className="w-12 h-12 mx-auto text-muted-foreground opacity-30 mb-4" />
            <p className="text-muted-foreground">No hay registros de precios aún. Los precios se registran automáticamente cuando confirmas la llegada de un producto en Compras.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {porProducto.map(([productoId, entries]) => {
              const { pct, dir } = pctChange(entries);
              const latestEntry = entries[0];
              return (
                <div key={productoId} className="bg-card border border-border rounded-2xl overflow-hidden shadow-md">
                  {/* Product header */}
                  <div className="px-5 py-4 border-b border-border bg-muted/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                      <h3 className="font-bold text-foreground">{latestEntry.productoNombre}</h3>
                      {latestEntry.productoCodigo && (
                        <p className="text-xs text-muted-foreground font-mono">{latestEntry.productoCodigo}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm flex-shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Último P. Compra</p>
                        <p className="font-bold text-foreground">{formatCurrency(latestEntry.precioCompra)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Último P. Venta</p>
                        <p className="font-bold text-primary">{formatCurrency(latestEntry.precioVenta)}</p>
                      </div>
                      {entries.length > 1 && (
                        <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                          dir === "up" ? "bg-destructive/10 text-destructive" :
                          dir === "down" ? "bg-green-500/10 text-green-500" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {dir === "up" ? <TrendingUp className="w-3 h-3" /> :
                           dir === "down" ? <TrendingDown className="w-3 h-3" /> :
                           <Minus className="w-3 h-3" />}
                          {pct.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Price history table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="bg-muted/20 text-muted-foreground text-xs border-b border-border">
                          <th className="px-4 py-2 font-medium">Fecha</th>
                          <th className="px-4 py-2 font-medium">P. Compra</th>
                          <th className="px-4 py-2 font-medium">P. Venta</th>
                          <th className="px-4 py-2 font-medium hidden sm:table-cell">Proveedor</th>
                          <th className="px-4 py-2 font-medium hidden sm:table-cell">Origen</th>
                          <th className="px-4 py-2 font-medium hidden md:table-cell">Actualizó Inventario</th>
                          <th className="px-2 py-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {entries.map((e, idx) => {
                          const prev = entries[idx + 1];
                          const subio = prev && e.precioCompra > prev.precioCompra;
                          const bajo = prev && e.precioCompra < prev.precioCompra;
                          return (
                            <tr key={e.id} className={`hover:bg-muted/20 transition-colors group ${idx === 0 ? "font-semibold" : ""}`}>
                              <td className="px-4 py-2.5 whitespace-nowrap text-xs">
                                {new Date(e.fecha + "T12:00:00").toLocaleDateString("es-CO")}
                                {idx === 0 && <span className="ml-1.5 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Último</span>}
                              </td>
                              <td className="px-4 py-2.5 whitespace-nowrap">
                                <span className="font-mono">{formatCurrency(e.precioCompra)}</span>
                                {subio && <span className="ml-1 text-[10px] text-destructive">↑</span>}
                                {bajo && <span className="ml-1 text-[10px] text-green-500">↓</span>}
                              </td>
                              <td className="px-4 py-2.5 text-primary whitespace-nowrap font-mono">{formatCurrency(e.precioVenta)}</td>
                              <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{e.proveedor || <span className="italic text-xs">—</span>}</td>
                              <td className="px-4 py-2.5 hidden sm:table-cell">
                                <span className="text-xs px-2 py-0.5 rounded-full bg-muted capitalize">{e.origen}</span>
                              </td>
                              <td className="px-4 py-2.5 hidden md:table-cell">
                                {e.actualizoPrecioInventario === "si" ? (
                                  <span className="text-xs text-green-500">✓ Sí</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">No</span>
                                )}
                              </td>
                               <td className="px-2 py-2 text-right">
                                 <button
                                   onClick={() => handleDeleteEntry(e.id)}
                                   disabled={deletingId === e.id}
                                   title="Eliminar"
                                   className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive rounded"
                                 >
                                   {deletingId === e.id ? "…" : <Trash2 className="w-3.5 h-3.5" />}
                                 </button>
                               </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
