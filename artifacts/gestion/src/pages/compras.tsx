import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/Layout";
import {
  useGetCompras,
  useActualizarCompra,
  useCrearCompra,
  useEliminarCompra,
  useGetInventario,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { PackageCheck, Truck, Plus, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface LlegadaForm {
  cantidad: string;
  nuevoPrecioCompra: string;
  nuevoPrecioVentaSinIva: string;
  tieneIva: boolean;
  proveedor: string;
}

function ProductoAutocomplete({
  productos,
  comprasExistentes,
  onSelect,
}: {
  productos: any[];
  comprasExistentes: any[];
  onSelect: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const disponibles = productos.filter(
    (p) => !comprasExistentes.some((c) => c.productoId === p.id && c.estado === "pendiente")
  );

  const filtered = query.trim()
    ? disponibles.filter(
        (p) =>
          p.nombre.toLowerCase().includes(query.toLowerCase()) ||
          p.codigo.toLowerCase().includes(query.toLowerCase()) ||
          (p.marca || "").toLowerCase().includes(query.toLowerCase())
      )
    : disponibles.slice(0, 10);

  const handleSelect = (p: any) => {
    setSelected(p);
    setQuery(p.nombre);
    setOpen(false);
    onSelect(p.id);
  };

  const handleClear = () => {
    setSelected(null);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="relative">
        <input
          type="text"
          placeholder="Buscar producto por nombre, código o marca..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm pr-8"
        />
        {(query || selected) && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {open && query.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-2xl overflow-hidden max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-center py-4 text-muted-foreground text-sm">Sin resultados para "{query}"</p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(p); }}
                className="w-full text-left px-4 py-2.5 hover:bg-muted transition-colors border-b border-border/50 last:border-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-sm truncate">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      [{p.codigo}]{p.marca ? ` · ${p.marca}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">Stock: {p.stockActual}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
      {selected && (
        <div className="mt-1.5 px-3 py-1.5 bg-primary/10 border border-primary/30 rounded-lg text-xs text-primary font-medium">
          ✓ {selected.nombre} [{selected.codigo}]
        </div>
      )}
    </div>
  );
}

export default function Compras() {
  const { data: compras, isLoading } = useGetCompras();
  const { data: productos } = useGetInventario();
  const queryClient = useQueryClient();

  const actualizarMutation = useActualizarCompra();
  const crearMutation = useCrearCompra();
  const eliminarMutation = useEliminarCompra();

  const [llegadaOpen, setLlegadaOpen] = useState<number | null>(null);
  const [llegadaForm, setLlegadaForm] = useState<LlegadaForm>({
    cantidad: "",
    nuevoPrecioCompra: "",
    nuevoPrecioVentaSinIva: "",
    tieneIva: false,
    proveedor: "",
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState<number | null>(null);

  const openLlegada = (compra: any) => {
    setLlegadaOpen(compra.id);
    const prod = productos?.find((p) => p.id === compra.productoId);
    setLlegadaForm({
      cantidad: "",
      nuevoPrecioCompra: prod ? String(prod.precioCompra) : "",
      nuevoPrecioVentaSinIva: prod ? String(prod.precioVentaSinIva) : "",
      tieneIva: prod ? prod.tieneIva : false,
      proveedor: "",
    });
  };

  const handleLlegada = (compra: any) => {
    if (!llegadaForm.cantidad || parseFloat(llegadaForm.cantidad) <= 0) {
      alert("Ingresa la cantidad recibida");
      return;
    }
    actualizarMutation.mutate(
      {
        id: compra.id,
        data: {
          estado: "llegado",
          cantidadRecibida: parseFloat(llegadaForm.cantidad),
          nuevoPrecioCompra: llegadaForm.nuevoPrecioCompra ? parseFloat(llegadaForm.nuevoPrecioCompra) : undefined,
          nuevoPrecioVentaSinIva: llegadaForm.nuevoPrecioVentaSinIva ? parseFloat(llegadaForm.nuevoPrecioVentaSinIva) : undefined,
          tieneIva: llegadaForm.tieneIva,
          proveedor: llegadaForm.proveedor || undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/compras"] });
          queryClient.invalidateQueries({ queryKey: ["/api/inventario"] });
          setLlegadaOpen(null);
        },
      }
    );
  };

  const handleAddManual = () => {
    if (!productoSeleccionado) {
      alert("Selecciona un producto");
      return;
    }
    crearMutation.mutate(
      { data: { productoId: productoSeleccionado } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/compras"] });
          setShowAddForm(false);
          setProductoSeleccionado(null);
        },
      }
    );
  };

  const handleEliminar = (id: number) => {
    if (confirm("¿Eliminar esta orden de compra?")) {
      eliminarMutation.mutate(
        { id },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/compras"] }) }
      );
    }
  };

  const pendientes = compras?.filter((c) => c.estado === "pendiente") || [];
  const llegados = compras?.filter((c) => c.estado === "llegado") || [];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Módulo de Compras</h1>
            <p className="text-muted-foreground mt-1 text-sm">Pedidos pendientes y registro histórico de llegadas.</p>
          </div>
          <button
            onClick={() => { setShowAddForm(!showAddForm); setProductoSeleccionado(null); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-md text-sm"
          >
            <Plus className="w-4 h-4" />
            Agregar Producto
          </button>
        </div>

        {/* Autocomplete add form */}
        {showAddForm && (
          <div className="bg-card border border-border rounded-2xl p-5 animate-in fade-in slide-in-from-top-3 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-foreground">Agregar producto a lista de compras</h3>
              <button onClick={() => setShowAddForm(false)} className="p-1 hover:bg-muted rounded-lg">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="flex gap-3 flex-col sm:flex-row items-end">
              <ProductoAutocomplete
                productos={productos || []}
                comprasExistentes={compras || []}
                onSelect={(id) => setProductoSeleccionado(id)}
              />
              <button
                onClick={handleAddManual}
                disabled={crearMutation.isPending || !productoSeleccionado}
                className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all disabled:opacity-50 text-sm whitespace-nowrap"
              >
                {crearMutation.isPending ? "Agregando..." : "Agregar"}
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Cargando...</div>
        ) : pendientes.length === 0 && llegados.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-2xl border border-border">
            <PackageCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground">No hay compras registradas</h3>
            <p className="text-muted-foreground text-sm">Agrega un producto para iniciar un pedido.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {pendientes.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-destructive inline-block"></span>
                  Pedidos Pendientes ({pendientes.length})
                </h3>
                <div className="space-y-3">
                  {pendientes.map((compra) => (
                    <div key={compra.id} className="bg-card rounded-xl border border-destructive/40 shadow-md overflow-hidden">
                      <div className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-destructive/10 flex-shrink-0">
                            <Truck className="w-5 h-5 text-destructive" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-foreground truncate">{compra.productoNombre}</h3>
                            <p className="text-sm text-muted-foreground">
                              Cód: {compra.productoCodigo}
                              {compra.productoMarca ? ` | ${compra.productoMarca}` : ""} | Stock mín: {compra.stockMinimo}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <div className="text-center px-4">
                            <p className="text-xs text-muted-foreground">Stock actual</p>
                            <p className={`text-xl font-bold ${compra.stockActual <= 0 ? "text-destructive" : "text-foreground"}`}>
                              {compra.stockActual}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => openLlegada(compra)}
                              className="px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all text-sm whitespace-nowrap"
                            >
                              Ingresar Inventario
                            </button>
                            <button
                              onClick={() => handleEliminar(compra.id)}
                              className="p-2 text-muted-foreground hover:text-destructive bg-muted rounded-xl transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {llegadaOpen === compra.id && (
                        <div className="border-t border-border p-4 bg-background animate-in fade-in slide-in-from-top-2">
                          <h4 className="text-sm font-bold text-foreground mb-3">Registrar llegada de mercancía</h4>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">Cantidad <span className="text-destructive">*</span></label>
                              <input type="number" placeholder="0" value={llegadaForm.cantidad} onChange={(e) => setLlegadaForm({ ...llegadaForm, cantidad: e.target.value })} className="w-full bg-card border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">P. Compra nuevo</label>
                              <input type="number" value={llegadaForm.nuevoPrecioCompra} onChange={(e) => setLlegadaForm({ ...llegadaForm, nuevoPrecioCompra: e.target.value })} className="w-full bg-card border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                              {productos?.find((p) => p.id === compra.productoId) && (
                                <p className="text-xs text-muted-foreground mt-0.5">Actual: {formatCurrency(productos.find((p) => p.id === compra.productoId)!.precioCompra)}</p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">P. Venta s/IVA nuevo</label>
                              <input type="number" value={llegadaForm.nuevoPrecioVentaSinIva} onChange={(e) => setLlegadaForm({ ...llegadaForm, nuevoPrecioVentaSinIva: e.target.value })} className="w-full bg-card border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                              {productos?.find((p) => p.id === compra.productoId) && (
                                <p className="text-xs text-muted-foreground mt-0.5">c/IVA: {formatCurrency(productos.find((p) => p.id === compra.productoId)!.precioVentaConIva)}</p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">IVA</label>
                              <button type="button" onClick={() => setLlegadaForm({ ...llegadaForm, tieneIva: !llegadaForm.tieneIva })} className={`w-full py-2 rounded-lg border text-xs font-medium transition-all ${llegadaForm.tieneIva ? "bg-primary/20 border-primary text-primary" : "bg-card border-border text-muted-foreground"}`}>
                                {llegadaForm.tieneIva ? "✓ Con IVA" : "Sin IVA"}
                              </button>
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs text-muted-foreground mb-1">Proveedor</label>
                              <input type="text" placeholder="Nombre del proveedor..." value={llegadaForm.proveedor} onChange={(e) => setLlegadaForm({ ...llegadaForm, proveedor: e.target.value })} className="w-full bg-card border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                            </div>
                          </div>
                          <div className="flex gap-3 mt-4 justify-end">
                            <button onClick={() => setLlegadaOpen(null)} className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors">Cancelar</button>
                            <button onClick={() => handleLlegada(compra)} disabled={actualizarMutation.isPending} className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500 transition-colors">
                              {actualizarMutation.isPending ? "Guardando..." : "Confirmar Llegada"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {llegados.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                  Historial de Llegadas ({llegados.length})
                </h3>
                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="bg-muted text-muted-foreground border-b border-border">
                          <th className="px-4 py-3 font-medium whitespace-nowrap">Fecha Llegada</th>
                          <th className="px-4 py-3 font-medium whitespace-nowrap">Producto</th>
                          <th className="px-4 py-3 font-medium whitespace-nowrap hidden sm:table-cell">Marca</th>
                          <th className="px-4 py-3 font-medium whitespace-nowrap">Cant.</th>
                          <th className="px-4 py-3 font-medium whitespace-nowrap hidden md:table-cell">P. Compra</th>
                          <th className="px-4 py-3 font-medium whitespace-nowrap hidden md:table-cell">P. Venta</th>
                          <th className="px-4 py-3 font-medium whitespace-nowrap">Total Compra</th>
                          <th className="px-4 py-3 font-medium whitespace-nowrap hidden lg:table-cell">Proveedor</th>
                          <th className="px-4 py-3 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {llegados.map((compra) => {
                          const cantRec = compra.cantidadRecibida ?? 0;
                          const precioC = compra.precioCompraRegistrado ?? 0;
                          const precioV = compra.precioVentaRegistrado ?? 0;
                          const totalCompra = cantRec * precioC;
                          return (
                            <tr key={compra.id} className="hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                                {compra.fechaLlegada ? new Date(compra.fechaLlegada + "T12:00:00").toLocaleDateString("es-CO") : "—"}
                              </td>
                              <td className="px-4 py-3 font-medium text-foreground">{compra.productoNombre}</td>
                              <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{compra.productoMarca || "—"}</td>
                              <td className="px-4 py-3 font-medium">{cantRec > 0 ? cantRec : "—"}</td>
                              <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{precioC > 0 ? formatCurrency(precioC) : "—"}</td>
                              <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{precioV > 0 ? formatCurrency(precioV) : "—"}</td>
                              <td className="px-4 py-3 font-bold text-primary">{totalCompra > 0 ? formatCurrency(totalCompra) : "—"}</td>
                              <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{compra.proveedor || <span className="italic text-xs">Sin registrar</span>}</td>
                              <td className="px-4 py-3">
                                <button onClick={() => handleEliminar(compra.id)} className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors">
                                  <X className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-muted/50 border-t border-border">
                        <tr>
                          <td colSpan={6} className="px-4 py-3 text-right text-xs text-muted-foreground font-medium uppercase tracking-wider hidden md:table-cell">Total invertido en compras</td>
                          <td colSpan={3} className="px-4 py-3 text-right text-xs text-muted-foreground font-medium uppercase tracking-wider md:hidden">Total invertido</td>
                          <td className="px-4 py-3 font-bold text-primary">
                            {formatCurrency(llegados.reduce((sum, c) => sum + (c.cantidadRecibida ?? 0) * (c.precioCompraRegistrado ?? 0), 0))}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
