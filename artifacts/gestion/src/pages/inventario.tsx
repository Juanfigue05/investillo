import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { useGetInventario, useCrearProducto, useActualizarProducto, useEliminarProducto } from "@workspace/api-client-react";
import { formatCurrency, calcularPrecioConIva } from "@/lib/utils";
import { Plus, Search, Edit2, Trash2, AlertCircle, ChevronUp, ChevronDown, ChevronsUpDown, Filter, X, ChevronDown as ChevDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

type SortCol = "codigo" | "nombre" | "marca" | "tipo" | "precioCompra" | "precioVentaConIva" | "stockActual";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortCol, sortDir }: { col: SortCol; sortCol: SortCol; sortDir: SortDir }) {
  if (sortCol !== col) return <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />;
  return sortDir === "asc" ? <ChevronUp className="w-3.5 h-3.5 text-primary" /> : <ChevronDown className="w-3.5 h-3.5 text-primary" />;
}

interface FilterPanel {
  marcas: string[];
  tipos: string[];
  marcaBusqueda: string;
  tipoBusqueda: string;
}

export default function Inventario() {
  const { data: productos, isLoading } = useGetInventario();
  const queryClient = useQueryClient();
  const crearMutation = useCrearProducto();
  const actualizarMutation = useActualizarProducto();
  const eliminarMutation = useEliminarProducto();

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>("nombre");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterPanel>({
    marcas: [],
    tipos: [],
    marcaBusqueda: "",
    tipoBusqueda: "",
  });

  const [formData, setFormData] = useState({
    nombre: "",
    codigo: "",
    marca: "",
    tipo: "",
    referencia: "",
    adicional: "",
    precioCompra: 0,
    precioVentaSinIva: 0,
    tieneIva: false,
    stockActual: 0,
    stockMinimo: 0,
  });

  // Unique marcas and tipos from inventory
  const allMarcas = useMemo(() =>
    [...new Set((productos || []).map(p => p.marca).filter(Boolean) as string[])].sort(),
    [productos]
  );
  const allTipos = useMemo(() =>
    [...new Set((productos || []).map(p => (p as any).tipo).filter(Boolean) as string[])].sort(),
    [productos]
  );

  const filteredMarcas = allMarcas.filter(m => m.toLowerCase().includes(filters.marcaBusqueda.toLowerCase()));
  const filteredTipos = allTipos.filter(t => t.toLowerCase().includes(filters.tipoBusqueda.toLowerCase()));

  const toggleMarca = (m: string) =>
    setFilters(f => ({ ...f, marcas: f.marcas.includes(m) ? f.marcas.filter(x => x !== m) : [...f.marcas, m] }));
  const toggleTipo = (t: string) =>
    setFilters(f => ({ ...f, tipos: f.tipos.includes(t) ? f.tipos.filter(x => x !== t) : [...f.tipos, t] }));
  const clearFilters = () => setFilters({ marcas: [], tipos: [], marcaBusqueda: "", tipoBusqueda: "" });

  const activeFilterCount = filters.marcas.length + filters.tipos.length;

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const filteredProductos = useMemo(() => {
    return (productos || [])
      .filter(p => {
        const q = search.toLowerCase();
        const matchSearch = !q ||
          p.nombre.toLowerCase().includes(q) ||
          p.codigo.toLowerCase().includes(q) ||
          (p.marca || "").toLowerCase().includes(q) ||
          ((p as any).tipo || "").toLowerCase().includes(q) ||
          (p.referencia || "").toLowerCase().includes(q);
        const matchMarca = filters.marcas.length === 0 || filters.marcas.includes(p.marca || "");
        const matchTipo = filters.tipos.length === 0 || filters.tipos.includes((p as any).tipo || "");
        return matchSearch && matchMarca && matchTipo;
      })
      .sort((a, b) => {
        let av: any = (a as any)[sortCol];
        let bv: any = (b as any)[sortCol];
        if (typeof av === "string") av = av.toLowerCase();
        if (typeof bv === "string") bv = bv.toLowerCase();
        if (av === null || av === undefined) av = "";
        if (bv === null || bv === undefined) bv = "";
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
  }, [productos, search, filters, sortCol, sortDir]);

  const openEdit = (prod: any) => {
    setFormData({
      nombre: prod.nombre,
      codigo: prod.codigo,
      marca: prod.marca || "",
      tipo: prod.tipo || "",
      referencia: prod.referencia || "",
      adicional: prod.adicional || "",
      precioCompra: prod.precioCompra,
      precioVentaSinIva: prod.precioVentaSinIva,
      tieneIva: prod.tieneIva,
      stockActual: prod.stockActual,
      stockMinimo: prod.stockMinimo,
    });
    setEditingId(prod.id);
    setShowForm(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      actualizarMutation.mutate({ id: editingId, data: formData }, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventario"] }); setShowForm(false); },
      });
    } else {
      crearMutation.mutate({ data: formData }, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventario"] }); setShowForm(false); },
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("¿Estás seguro de eliminar este producto?")) {
      eliminarMutation.mutate({ id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/inventario"] }) });
    }
  };

  const margen = formData.precioCompra > 0 ? ((formData.precioVentaSinIva - formData.precioCompra) / formData.precioCompra) * 100 : 0;
  const precioConIva = formData.tieneIva ? calcularPrecioConIva(formData.precioVentaSinIva) : formData.precioVentaSinIva;

  const thClass = "px-3 py-3 font-medium cursor-pointer select-none hover:bg-muted/70 transition-colors whitespace-nowrap text-xs lg:text-sm";

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Inventario</h1>
            <p className="text-muted-foreground mt-1 text-sm">Gestiona tus productos, precios y alertas de stock.</p>
          </div>
          <button
            onClick={() => {
              setEditingId(null);
              setFormData({ nombre: "", codigo: "", marca: "", tipo: "", referencia: "", adicional: "", precioCompra: 0, precioVentaSinIva: 0, tieneIva: true, stockActual: 0, stockMinimo: 0 });
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-lg hover:shadow-primary/25 whitespace-nowrap text-sm"
          >
            <Plus className="w-4 h-4" />
            Nuevo Producto
          </button>
        </div>

        {/* Search + Filter bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por código, nombre, marca, tipo o referencia..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl focus:ring-2 focus:ring-primary focus:outline-none text-sm"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all whitespace-nowrap ${
              activeFilterCount > 0
                ? "bg-primary/10 border-primary text-primary"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Filter className="w-4 h-4" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">{activeFilterCount}</span>
            )}
            <ChevDown className={`w-4 h-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="bg-card border border-border rounded-2xl p-4 shadow-lg animate-in fade-in slide-in-from-top-2">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-foreground">Filtros de Inventario</h3>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors">
                  <X className="w-3 h-3" />
                  Limpiar filtros
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Marca filter */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Marca</label>
                <input
                  type="text"
                  placeholder="Buscar marca..."
                  value={filters.marcaBusqueda}
                  onChange={(e) => setFilters(f => ({ ...f, marcaBusqueda: e.target.value }))}
                  className="w-full bg-background border border-border px-3 py-1.5 rounded-lg text-xs mb-2 focus:ring-1 focus:ring-primary outline-none"
                />
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {filteredMarcas.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Sin marcas disponibles</p>
                  ) : filteredMarcas.map(m => (
                    <label key={m} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={filters.marcas.includes(m)}
                        onChange={() => toggleMarca(m)}
                        className="w-4 h-4 rounded accent-primary"
                      />
                      <span className={`text-xs transition-colors ${filters.marcas.includes(m) ? "text-primary font-medium" : "text-foreground group-hover:text-primary"}`}>
                        {m}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Tipo filter */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tipo</label>
                <input
                  type="text"
                  placeholder="Buscar tipo..."
                  value={filters.tipoBusqueda}
                  onChange={(e) => setFilters(f => ({ ...f, tipoBusqueda: e.target.value }))}
                  className="w-full bg-background border border-border px-3 py-1.5 rounded-lg text-xs mb-2 focus:ring-1 focus:ring-primary outline-none"
                />
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {filteredTipos.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Sin tipos disponibles</p>
                  ) : filteredTipos.map(t => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={filters.tipos.includes(t)}
                        onChange={() => toggleTipo(t)}
                        className="w-4 h-4 rounded accent-primary"
                      />
                      <span className={`text-xs transition-colors ${filters.tipos.includes(t) ? "text-primary font-medium" : "text-foreground group-hover:text-primary"}`}>
                        {t}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-2">
            {filters.marcas.map(m => (
              <span key={m} className="flex items-center gap-1 bg-primary/10 border border-primary/30 text-primary text-xs px-2 py-1 rounded-full">
                Marca: {m}
                <button onClick={() => toggleMarca(m)} className="hover:text-destructive"><X className="w-3 h-3" /></button>
              </span>
            ))}
            {filters.tipos.map(t => (
              <span key={t} className="flex items-center gap-1 bg-primary/10 border border-primary/30 text-primary text-xs px-2 py-1 rounded-full">
                Tipo: {t}
                <button onClick={() => toggleTipo(t)} className="hover:text-destructive"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}

        {/* Table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl shadow-black/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs lg:text-sm">
              <thead>
                <tr className="bg-muted text-muted-foreground border-b border-border">
                  <th className={thClass} onClick={() => handleSort("codigo")}>
                    <span className="flex items-center gap-1">Código <SortIcon col="codigo" sortCol={sortCol} sortDir={sortDir} /></span>
                  </th>
                  <th className={thClass} onClick={() => handleSort("nombre")}>
                    <span className="flex items-center gap-1">Producto <SortIcon col="nombre" sortCol={sortCol} sortDir={sortDir} /></span>
                  </th>
                  <th className={thClass} onClick={() => handleSort("marca")}>
                    <span className="flex items-center gap-1">Marca <SortIcon col="marca" sortCol={sortCol} sortDir={sortDir} /></span>
                  </th>
                  <th className={thClass} onClick={() => handleSort("tipo")}>
                    <span className="flex items-center gap-1">Tipo <SortIcon col="tipo" sortCol={sortCol} sortDir={sortDir} /></span>
                  </th>
                  <th className={thClass} onClick={() => handleSort("precioCompra")}>
                    <span className="flex items-center gap-1">P. Compra <SortIcon col="precioCompra" sortCol={sortCol} sortDir={sortDir} /></span>
                  </th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap text-xs lg:text-sm">P. Venta s/IVA</th>
                  <th className={`${thClass} text-primary`} onClick={() => handleSort("precioVentaConIva")}>
                    <span className="flex items-center gap-1">P. Venta c/IVA <SortIcon col="precioVentaConIva" sortCol={sortCol} sortDir={sortDir} /></span>
                  </th>
                  <th className={thClass} onClick={() => handleSort("stockActual")}>
                    <span className="flex items-center gap-1">Stock <SortIcon col="stockActual" sortCol={sortCol} sortDir={sortDir} /></span>
                  </th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap text-xs lg:text-sm">Adicional</th>
                  <th className="px-3 py-3 font-medium text-right text-xs lg:text-sm">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr><td colSpan={10} className="px-6 py-8 text-center text-muted-foreground">Cargando inventario...</td></tr>
                ) : filteredProductos?.length === 0 ? (
                  <tr><td colSpan={10} className="px-6 py-8 text-center text-muted-foreground">No se encontraron productos.</td></tr>
                ) : (
                  filteredProductos?.map((prod) => (
                    <tr key={prod.id} className="hover:bg-muted/50 transition-colors group">
                      <td className="px-3 py-3 text-foreground font-mono text-xs">{prod.codigo}</td>
                      <td className="px-3 py-3 text-foreground font-medium max-w-[180px] truncate">{prod.nombre}</td>
                      <td className="px-3 py-3 text-muted-foreground">{prod.marca || "—"}</td>
                      <td className="px-3 py-3 text-muted-foreground">{(prod as any).tipo || "—"}</td>
                      <td className="px-3 py-3 text-muted-foreground">{formatCurrency(prod.precioCompra)}</td>
                      <td className="px-3 py-3 text-muted-foreground">{formatCurrency(prod.precioVentaSinIva)}</td>
                      <td className="px-3 py-3 text-primary font-bold">{formatCurrency(prod.precioVentaConIva)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={prod.stockActual <= prod.stockMinimo ? "text-destructive font-bold" : "text-foreground"}>
                            {typeof prod.stockActual === "number" ? prod.stockActual.toLocaleString("es-CO", { maximumFractionDigits: 2 }) : prod.stockActual}
                          </span>
                          {prod.stockActual <= prod.stockMinimo && (
                            <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground text-xs max-w-[120px] truncate" title={(prod as any).adicional || ""}>
                        {(prod as any).adicional || "—"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(prod)} className="p-1.5 text-muted-foreground hover:text-primary bg-muted rounded-lg transition-colors">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(prod.id)} className="p-1.5 text-muted-foreground hover:text-destructive bg-muted rounded-lg transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {filteredProductos && filteredProductos.length > 0 && (
                <tfoot className="bg-muted/30 border-t border-border">
                  <tr>
                    <td colSpan={8} className="px-3 py-2 text-xs text-muted-foreground text-right">
                      {filteredProductos.length} producto{filteredProductos.length !== 1 ? "s" : ""}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Form Dialog */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card w-full max-w-2xl rounded-2xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-border bg-muted/50 flex justify-between items-center sticky top-0">
              <h3 className="text-xl font-display font-bold text-foreground">
                {editingId ? "Editar Producto" : "Nuevo Producto"}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Código</label>
                  <input required type="text" value={formData.codigo} onChange={e => setFormData({ ...formData, codigo: e.target.value })} className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Nombre</label>
                  <input required type="text" value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Marca</label>
                  <input type="text" value={formData.marca} onChange={e => setFormData({ ...formData, marca: e.target.value })} className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Tipo</label>
                  <input type="text" placeholder="Ej: Filtro, Aceite, Frenos..." value={formData.tipo} onChange={e => setFormData({ ...formData, tipo: e.target.value })} className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Referencia</label>
                  <input type="text" value={formData.referencia} onChange={e => setFormData({ ...formData, referencia: e.target.value })} className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Adicional / Observaciones</label>
                <textarea
                  rows={3}
                  placeholder="Información adicional, notas, compatibilidad, etc."
                  value={formData.adicional}
                  onChange={e => setFormData({ ...formData, adicional: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground resize-none text-sm"
                />
              </div>

              <hr className="border-border" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Stock Actual</label>
                  <input required type="number" step="0.01" value={formData.stockActual} onChange={e => setFormData({ ...formData, stockActual: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Stock Mínimo (Alerta)</label>
                  <input required type="number" step="0.01" value={formData.stockMinimo} onChange={e => setFormData({ ...formData, stockMinimo: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground" />
                </div>
              </div>

              <hr className="border-border" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Precio Compra ($)</label>
                  <input required type="number" value={formData.precioCompra} onChange={e => setFormData({ ...formData, precioCompra: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1 flex items-center justify-between">
                    <span>Precio Venta Sin IVA ($)</span>
                    <span className={margen < 20 ? "text-destructive text-xs" : "text-green-500 text-xs"}>
                      Margen: {margen.toFixed(1)}%
                    </span>
                  </label>
                  <input required type="number" value={formData.precioVentaSinIva} onChange={e => setFormData({ ...formData, precioVentaSinIva: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground" />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-muted/30 p-4 rounded-xl border border-border">
                <label className="flex items-center gap-2 text-foreground cursor-pointer">
                  <input type="checkbox" checked={formData.tieneIva} onChange={e => setFormData({ ...formData, tieneIva: e.target.checked })} className="w-5 h-5 rounded border-border text-primary focus:ring-primary bg-background" />
                  Aplica IVA (19%)
                </label>
                <div className="flex-1 text-right">
                  <span className="text-sm text-muted-foreground mr-2">Precio Final Público:</span>
                  <span className="text-2xl font-bold text-primary">{formatCurrency(precioConIva)}</span>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2 rounded-xl text-foreground bg-muted hover:bg-muted/80 transition-colors">Cancelar</button>
                <button type="submit" disabled={crearMutation.isPending || actualizarMutation.isPending} className="px-6 py-2 rounded-xl text-primary-foreground bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all">
                  Guardar Producto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
