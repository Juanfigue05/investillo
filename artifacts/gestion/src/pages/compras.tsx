import { useState } from "react";
import { Layout } from "@/components/Layout";
import {
  useGetCompras,
  useActualizarCompra,
  useCrearCompra,
  useEliminarCompra,
  useGetInventario,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { PackageCheck, Truck, Plus, X, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface LlegadaForm {
  cantidad: string;
  nuevoPrecioCompra: string;
  nuevoPrecioVentaSinIva: string;
  tieneIva: boolean;
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
  });

  // Add product manually
  const [showAddForm, setShowAddForm] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");

  const openLlegada = (compra: any) => {
    setLlegadaOpen(compra.id);
    // Pre-fill with current values from inventario
    const prod = productos?.find((p) => p.id === compra.productoId);
    setLlegadaForm({
      cantidad: "",
      nuevoPrecioCompra: prod ? String(prod.precioCompra) : "",
      nuevoPrecioVentaSinIva: prod ? String(prod.precioVentaSinIva) : "",
      tieneIva: prod ? prod.tieneIva : false,
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
          nuevoPrecioCompra: llegadaForm.nuevoPrecioCompra
            ? parseFloat(llegadaForm.nuevoPrecioCompra)
            : undefined,
          nuevoPrecioVentaSinIva: llegadaForm.nuevoPrecioVentaSinIva
            ? parseFloat(llegadaForm.nuevoPrecioVentaSinIva)
            : undefined,
          tieneIva: llegadaForm.tieneIva,
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
      { data: { productoId: parseInt(productoSeleccionado) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/compras"] });
          setShowAddForm(false);
          setProductoSeleccionado("");
          setBusquedaProducto("");
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

  const productosDisponibles = productos?.filter(
    (p) =>
      !compras?.some((c) => c.productoId === p.id && c.estado === "pendiente") &&
      (busquedaProducto
        ? p.nombre.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
          p.codigo.toLowerCase().includes(busquedaProducto.toLowerCase())
        : true)
  );

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Módulo de Compras</h1>
            <p className="text-muted-foreground mt-1">
              Productos con stock bajo y pedidos pendientes de llegar.
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-md"
          >
            <Plus className="w-4 h-4" />
            Agregar Producto
          </button>
        </div>

        {/* Manual add form */}
        {showAddForm && (
          <div className="bg-card border border-border rounded-2xl p-5 animate-in fade-in slide-in-from-top-3 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-foreground">Agregar producto a lista de compras</h3>
              <button onClick={() => setShowAddForm(false)} className="p-1 hover:bg-muted rounded-lg">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="flex gap-3 flex-col sm:flex-row">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Buscar producto por nombre o código..."
                  value={busquedaProducto}
                  onChange={(e) => {
                    setBusquedaProducto(e.target.value);
                    setProductoSeleccionado("");
                  }}
                  className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm mb-2"
                />
                <select
                  value={productoSeleccionado}
                  onChange={(e) => setProductoSeleccionado(e.target.value)}
                  className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
                >
                  <option value="">Seleccionar producto...</option>
                  {productosDisponibles?.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.codigo}] {p.nombre} {p.marca ? `— ${p.marca}` : ""} (Stock: {p.stockActual})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button
                  onClick={handleAddManual}
                  disabled={crearMutation.isPending}
                  className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all"
                >
                  Agregar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pendientes */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Cargando...</div>
        ) : pendientes.length === 0 && llegados.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-2xl border border-border">
            <PackageCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground">No hay compras pendientes</h3>
            <p className="text-muted-foreground text-sm">El inventario está estable o no hay pedidos registrados.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {pendientes.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-destructive inline-block"></span>
                  Pendientes ({pendientes.length})
                </h3>
                <div className="space-y-3">
                  {pendientes.map((compra) => (
                    <div key={compra.id} className="bg-card rounded-xl border border-destructive/40 shadow-md overflow-hidden">
                      <div className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4 flex-1">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-destructive/10 flex-shrink-0">
                            <Truck className="w-5 h-5 text-destructive" />
                          </div>
                          <div>
                            <h3 className="font-bold text-foreground">{compra.productoNombre}</h3>
                            <p className="text-sm text-muted-foreground">
                              Cód: {compra.productoCodigo}
                              {compra.productoMarca ? ` | ${compra.productoMarca}` : ""} | Stock mín:{" "}
                              {compra.stockMinimo}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
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

                      {/* Arrival form */}
                      {llegadaOpen === compra.id && (
                        <div className="border-t border-border p-4 bg-background animate-in fade-in slide-in-from-top-2">
                          <h4 className="text-sm font-bold text-foreground mb-3">Registrar llegada de mercancía</h4>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">
                                Cantidad recibida <span className="text-destructive">*</span>
                              </label>
                              <input
                                type="number"
                                placeholder="0"
                                value={llegadaForm.cantidad}
                                onChange={(e) => setLlegadaForm({ ...llegadaForm, cantidad: e.target.value })}
                                className="w-full bg-card border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">
                                Precio compra actual → nuevo
                              </label>
                              <input
                                type="number"
                                placeholder={productos?.find((p) => p.id === compra.productoId)
                                  ? String(productos.find((p) => p.id === compra.productoId)!.precioCompra)
                                  : "0"}
                                value={llegadaForm.nuevoPrecioCompra}
                                onChange={(e) => setLlegadaForm({ ...llegadaForm, nuevoPrecioCompra: e.target.value })}
                                className="w-full bg-card border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                              />
                              {productos?.find((p) => p.id === compra.productoId) && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Actual: {formatCurrency(productos.find((p) => p.id === compra.productoId)!.precioCompra)}
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">
                                P. Venta sin IVA actual → nuevo
                              </label>
                              <input
                                type="number"
                                placeholder={productos?.find((p) => p.id === compra.productoId)
                                  ? String(productos.find((p) => p.id === compra.productoId)!.precioVentaSinIva)
                                  : "0"}
                                value={llegadaForm.nuevoPrecioVentaSinIva}
                                onChange={(e) =>
                                  setLlegadaForm({ ...llegadaForm, nuevoPrecioVentaSinIva: e.target.value })
                                }
                                className="w-full bg-card border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                              />
                              {productos?.find((p) => p.id === compra.productoId) && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Actual: {formatCurrency(productos.find((p) => p.id === compra.productoId)!.precioVentaSinIva)}
                                  {" → con IVA: "}
                                  {formatCurrency(productos.find((p) => p.id === compra.productoId)!.precioVentaConIva)}
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">¿Lleva IVA?</label>
                              <button
                                type="button"
                                onClick={() => setLlegadaForm({ ...llegadaForm, tieneIva: !llegadaForm.tieneIva })}
                                className={`w-full py-2 rounded-lg border text-sm font-medium transition-all ${
                                  llegadaForm.tieneIva
                                    ? "bg-primary/20 border-primary text-primary"
                                    : "bg-card border-border text-muted-foreground"
                                }`}
                              >
                                {llegadaForm.tieneIva ? "✓ Con IVA (19%)" : "Sin IVA"}
                              </button>
                            </div>
                          </div>
                          <div className="flex gap-3 mt-4 justify-end">
                            <button
                              onClick={() => setLlegadaOpen(null)}
                              className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => handleLlegada(compra)}
                              disabled={actualizarMutation.isPending}
                              className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500 transition-colors"
                            >
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
                  Llegados ({llegados.length})
                </h3>
                <div className="space-y-2 opacity-70">
                  {llegados.map((compra) => (
                    <div
                      key={compra.id}
                      className="bg-card rounded-xl border border-green-500/30 p-4 flex justify-between items-center"
                    >
                      <div className="flex items-center gap-3">
                        <PackageCheck className="w-5 h-5 text-green-500" />
                        <div>
                          <p className="font-medium text-foreground">{compra.productoNombre}</p>
                          <p className="text-xs text-muted-foreground">Cód: {compra.productoCodigo}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-green-500 text-sm font-medium">Llegado</span>
                        <button
                          onClick={() => handleEliminar(compra.id)}
                          className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
