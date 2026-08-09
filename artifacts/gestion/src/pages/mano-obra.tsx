import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import {
  useGetManoObra,
  useCrearManoObra,
  useGetTrabajadores,
  useCrearVenta,
  useActualizarTrabajador,
  useCrearTrabajador,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Wrench, Plus, Save, Users, Pencil, Check, X, Search, Filter } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function ManoObra() {
  const { data: manoObras, isLoading } = useGetManoObra();
  const { data: trabajadores } = useGetTrabajadores();

  const queryClient = useQueryClient();
  const crearMutation = useCrearManoObra();
  const crearVentaMutation = useCrearVenta();
  const actualizarTrabMutation = useActualizarTrabajador();
  const crearTrabMutation = useCrearTrabajador();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    descripcion: "",
    valorTotal: "",
    trabajadoresIds: [] as number[],
  });
  const [trabajadorValores, setTrabajadorValores] = useState<Record<number, string>>({});
  const [editingTrab, setEditingTrab] = useState<number | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [showAddTrab, setShowAddTrab] = useState(false);
  const [newTrabNombre, setNewTrabNombre] = useState("");

  // Filters
  const [filtroTrabajador, setFiltroTrabajador] = useState("");
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");
  const [filtroServicio, setFiltroServicio] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const redistributeEqually = (ids: number[], total: string) => {
    const valor = parseFloat(total) || 0;
    if (ids.length === 0 || valor === 0) return {};
    const n = ids.length;
    const base = Math.floor(valor / n);
    const resto = valor - base * n;
    const result: Record<number, string> = {};
    ids.forEach((id, i) => { result[id] = String(i === n - 1 ? base + resto : base); });
    return result;
  };

  const toggleTrabajador = (id: number) => {
    setFormData((prev) => {
      const newIds = prev.trabajadoresIds.includes(id)
        ? prev.trabajadoresIds.filter((t) => t !== id)
        : [...prev.trabajadoresIds, id];
      setTrabajadorValores(redistributeEqually(newIds, prev.valorTotal));
      return { ...prev, trabajadoresIds: newIds };
    });
  };

  const handleValorTotalChange = (val: string) => {
    setFormData((prev) => ({ ...prev, valorTotal: val }));
    if (formData.trabajadoresIds.length > 0) {
      setTrabajadorValores(redistributeEqually(formData.trabajadoresIds, val));
    }
  };

  const sumDistribucion = formData.trabajadoresIds.reduce((sum, id) => sum + (parseFloat(trabajadorValores[id] || "0") || 0), 0);
  const totalValor = parseFloat(formData.valorTotal) || 0;
  const sumDiffers = Math.abs(sumDistribucion - totalValor) > 1;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const valor = parseFloat(formData.valorTotal);
    if (!formData.descripcion || !valor || formData.trabajadoresIds.length === 0) {
      alert("Llene la descripción, el valor y seleccione al menos un trabajador.");
      return;
    }
    if (sumDiffers) {
      alert(`La suma (${formatCurrency(sumDistribucion)}) no coincide con el total (${formatCurrency(valor)}). Ajusta los valores.`);
      return;
    }
    const distribuciones = formData.trabajadoresIds.map((id) => {
      const t = trabajadores?.find((w) => w.id === id);
      return {
        trabajadorId: id,
        trabajadorNombre: t?.nombre || `Trabajador ${id}`,
        valor: parseFloat(trabajadorValores[id] || "0") || 0,
        descuentoSeguro: 0,
        descuentoOtros: 0,
      };
    });
    crearMutation.mutate(
      { data: { fecha: new Date().toISOString().split("T")[0], descripcion: formData.descripcion, valorTotal: valor, distribuciones } },
      {
        onSuccess: () => {
          crearVentaMutation.mutate(
            {
              data: {
                fecha: new Date().toISOString().split("T")[0],
                referencia: "Servicio",
                tipoLinea: "manoobra",
                productoNombre: "Mano de Obra",
                productoMarca: distribuciones.map((d) => d.trabajadorNombre).join(", "),
                cantidad: 1, precioCompraUnidad: 0, precioVentaUnidad: valor, precioVentaTotal: valor, beneficio: valor,
                descripcion: distribuciones.map((d) => `${d.trabajadorNombre}: ${formatCurrency(d.valor)}`).join(" | "),
              },
            },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: ["/api/manoobra"] });
                queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
                setShowForm(false);
                setFormData({ descripcion: "", valorTotal: "", trabajadoresIds: [] });
                setTrabajadorValores({});
              },
            }
          );
        },
      }
    );
  };

  const handleSaveTrab = (id: number) => {
    if (!editNombre.trim()) return;
    actualizarTrabMutation.mutate(
      { id, data: { nombre: editNombre.trim(), descuentoSeguro: 0, descuentoOtros: 0 } },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/trabajadores"] }); setEditingTrab(null); } }
    );
  };

  const handleAddTrab = () => {
    if (!newTrabNombre.trim()) return;
    crearTrabMutation.mutate(
      { data: { nombre: newTrabNombre.trim(), descuentoSeguro: 0, descuentoOtros: 0 } },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/trabajadores"] }); setShowAddTrab(false); setNewTrabNombre(""); } }
    );
  };

  const hasFilters = filtroTrabajador || filtroFechaDesde || filtroFechaHasta || filtroServicio;

  const filteredManoObras = useMemo(() => {
    if (!manoObras) return [];
    return manoObras.filter((mo) => {
      if (filtroServicio && !mo.descripcion.toLowerCase().includes(filtroServicio.toLowerCase())) return false;
      if (filtroFechaDesde && mo.fecha < filtroFechaDesde) return false;
      if (filtroFechaHasta && mo.fecha > filtroFechaHasta) return false;
      if (filtroTrabajador) {
        const q = filtroTrabajador.toLowerCase();
        const hasTrab = mo.distribuciones.some((d) => d.trabajadorNombre.toLowerCase().includes(q));
        if (!hasTrab) return false;
      }
      return true;
    });
  }, [manoObras, filtroTrabajador, filtroFechaDesde, filtroFechaHasta, filtroServicio]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Control Mano de Obra</h1>
            <p className="text-muted-foreground mt-1 text-sm">Registra y distribuye los cobros de servicios entre mecánicos.</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 text-sm"
          >
            <Plus className="w-4 h-4" />
            Registrar Servicio
          </button>
        </div>

        {/* Workers management */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-primary" />
              <h3 className="text-base font-bold text-foreground">Gestión de Trabajadores</h3>
            </div>
            <button
              onClick={() => { setShowAddTrab(!showAddTrab); setNewTrabNombre(""); }}
              className="flex items-center gap-2 px-3 py-1.5 bg-muted text-foreground rounded-xl border border-border hover:bg-muted/80 transition-colors text-sm font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar
            </button>
          </div>

          {showAddTrab && (
            <div className="flex gap-3 mb-4 animate-in fade-in slide-in-from-top-2">
              <input
                autoFocus type="text" placeholder="Nombre del nuevo trabajador"
                value={newTrabNombre} onChange={(e) => setNewTrabNombre(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTrab()}
                className="flex-1 bg-background border border-border px-4 py-2 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
              />
              <button onClick={handleAddTrab} disabled={crearTrabMutation.isPending} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors text-sm">Guardar</button>
              <button onClick={() => setShowAddTrab(false)} className="px-4 py-2 bg-muted text-foreground rounded-xl font-medium hover:bg-muted/80 transition-colors text-sm border border-border">Cancelar</button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {trabajadores?.map((t) => (
              <div key={t.id} className="bg-background rounded-xl border border-border p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary flex-shrink-0 text-sm">
                  {t.nombre.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  {editingTrab === t.id ? (
                    <input autoFocus type="text" value={editNombre} onChange={(e) => setEditNombre(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveTrab(t.id); if (e.key === "Escape") setEditingTrab(null); }}
                      className="w-full bg-card border border-primary px-2 py-1 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                    />
                  ) : (
                    <div>
                      <p className="font-medium text-foreground text-sm">{t.nombre}</p>
                      <p className="text-xs text-muted-foreground">Trabajador #{t.id}</p>
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0 flex gap-1">
                  {editingTrab === t.id ? (
                    <>
                      <button onClick={() => handleSaveTrab(t.id)} disabled={actualizarTrabMutation.isPending} className="p-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setEditingTrab(null)} className="p-1.5 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80"><X className="w-3.5 h-3.5" /></button>
                    </>
                  ) : (
                    <button onClick={() => { setEditingTrab(t.id); setEditNombre(t.nombre); }} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Service form */}
        {showForm && (
          <div className="bg-card border border-border p-5 rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-display font-bold text-foreground">Nuevo Registro de Mano de Obra</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Descripción del Servicio</label>
                  <input required type="text" value={formData.descripcion} onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })} placeholder="Ej: Cambio de pastillas" className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Valor Cobrado Total ($)</label>
                  <input required type="number" value={formData.valorTotal} onChange={(e) => handleValorTotalChange(e.target.value)} placeholder="50000" className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Trabajadores involucrados <span className="text-xs">(selecciona y ajusta el valor)</span></label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {trabajadores?.map((t) => (
                    <button key={t.id} type="button" onClick={() => toggleTrabajador(t.id)}
                      className={`px-3 py-1.5 rounded-xl border text-sm transition-all ${formData.trabajadoresIds.includes(t.id) ? "bg-primary/20 border-primary text-primary" : "bg-background border-border text-muted-foreground hover:border-muted-foreground"}`}
                    >
                      {t.nombre}
                    </button>
                  ))}
                </div>
                {formData.trabajadoresIds.length > 0 && (
                  <div className="bg-background rounded-xl border border-border divide-y divide-border overflow-hidden">
                    {formData.trabajadoresIds.map((id) => {
                      const t = trabajadores?.find((w) => w.id === id);
                      return (
                        <div key={id} className="flex items-center gap-4 px-4 py-3">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs flex-shrink-0">
                            {(t?.nombre || "?").charAt(0).toUpperCase()}
                          </div>
                          <span className="flex-1 text-sm font-medium text-foreground">{t?.nombre || `T${id}`}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">$</span>
                            <input
                              type="number"
                              value={trabajadorValores[id] || ""}
                              onChange={(e) => setTrabajadorValores((prev) => ({ ...prev, [id]: e.target.value }))}
                              className="w-28 bg-card border border-border px-2 py-1.5 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none text-right"
                              placeholder="0"
                            />
                          </div>
                        </div>
                      );
                    })}
                    <div className={`flex items-center justify-between px-4 py-2 ${sumDiffers ? "bg-destructive/10" : "bg-green-500/5"}`}>
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Suma distribuida</span>
                      <span className={`text-sm font-bold ${sumDiffers ? "text-destructive" : "text-green-500"}`}>
                        {formatCurrency(sumDistribucion)} {sumDiffers ? `(faltan ${formatCurrency(Math.abs(totalValor - sumDistribucion))})` : "✓"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end pt-3 border-t border-border">
                <button type="submit" disabled={crearMutation.isPending || crearVentaMutation.isPending || sumDiffers}
                  className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all disabled:opacity-50 text-sm"
                >
                  <Save className="w-4 h-4" />
                  Guardar y Enviar a Ventas
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filters */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-foreground">Historial de Servicios</h3>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${hasFilters ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filtrar
              {hasFilters && <span className="bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center">!</span>}
            </button>
          </div>

          {showFilters && (
            <div className="p-4 border-b border-border bg-muted/30 animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Trabajador</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Buscar trabajador..."
                      value={filtroTrabajador}
                      onChange={(e) => setFiltroTrabajador(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-background border border-border rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Servicio</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Buscar servicio..."
                      value={filtroServicio}
                      onChange={(e) => setFiltroServicio(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-background border border-border rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Desde</label>
                  <input type="date" value={filtroFechaDesde} onChange={(e) => setFiltroFechaDesde(e.target.value)} className="w-full py-2 px-3 bg-background border border-border rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Hasta</label>
                  <input type="date" value={filtroFechaHasta} onChange={(e) => setFiltroFechaHasta(e.target.value)} className="w-full py-2 px-3 bg-background border border-border rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" />
                </div>
              </div>
              {hasFilters && (
                <button onClick={() => { setFiltroTrabajador(""); setFiltroFechaDesde(""); setFiltroFechaHasta(""); setFiltroServicio(""); }}
                  className="mt-2 text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Limpiar filtros
                </button>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-muted text-muted-foreground border-b border-border">
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-5 py-3 font-medium">Servicio</th>
                  <th className="px-5 py-3 font-medium">Valor Total</th>
                  <th className="px-5 py-3 font-medium hidden md:table-cell">Distribución</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Cargando registros...</td></tr>
                ) : filteredManoObras.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">
                    {hasFilters ? "No hay resultados con los filtros aplicados." : "No hay servicios registrados aún."}
                  </td></tr>
                ) : (
                  filteredManoObras.map((mo) => (
                    <tr key={mo.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(mo.fecha + "T12:00:00").toLocaleDateString("es-CO")}
                      </td>
                      <td className="px-5 py-3 font-medium text-foreground">{mo.descripcion}</td>
                      <td className="px-5 py-3 text-primary font-bold whitespace-nowrap">{formatCurrency(mo.valorTotal)}</td>
                      <td className="px-5 py-3 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1.5">
                          {mo.distribuciones.map((d) => (
                            <span key={d.id} className="bg-background border border-border px-2 py-1 rounded-md text-xs flex items-center gap-1">
                              <span className="font-medium text-foreground">{d.trabajadorNombre}</span>
                              <span className="text-muted-foreground">{formatCurrency(d.valor)}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {filteredManoObras.length > 0 && (
                <tfoot className="bg-muted/30 border-t border-border">
                  <tr>
                    <td colSpan={2} className="px-5 py-2 text-xs text-muted-foreground text-right">{filteredManoObras.length} registro{filteredManoObras.length !== 1 ? "s" : ""}</td>
                    <td className="px-5 py-2 text-xs font-bold text-primary">
                      {formatCurrency(filteredManoObras.reduce((s, mo) => s + mo.valorTotal, 0))}
                    </td>
                    <td className="hidden md:table-cell"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
