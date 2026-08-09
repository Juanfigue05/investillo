import { useState } from "react";
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
import { Wrench, Plus, Save, Users, Pencil, Check, X } from "lucide-react";
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

  // Manual per-worker values: { [trabajadorId]: "valor_string" }
  const [trabajadorValores, setTrabajadorValores] = useState<Record<number, string>>({});

  const [editingTrab, setEditingTrab] = useState<number | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [showAddTrab, setShowAddTrab] = useState(false);
  const [newTrabNombre, setNewTrabNombre] = useState("");

  // Recalculate equal share when total changes and workers are selected
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
      // Redistribute equally whenever selection changes
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
      alert(`La suma de los valores individuales (${formatCurrency(sumDistribucion)}) no coincide con el total (${formatCurrency(valor)}). Ajusta los valores.`);
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

  const handleStartEdit = (trab: { id: number; nombre: string }) => {
    setEditingTrab(trab.id);
    setEditNombre(trab.nombre);
  };

  const handleSaveTrab = (id: number) => {
    if (!editNombre.trim()) return;
    actualizarTrabMutation.mutate(
      { id, data: { nombre: editNombre.trim(), descuentoSeguro: 0, descuentoOtros: 0 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/trabajadores"] });
          setEditingTrab(null);
        },
      }
    );
  };

  const handleAddTrab = () => {
    if (!newTrabNombre.trim()) return;
    crearTrabMutation.mutate(
      { data: { nombre: newTrabNombre.trim(), descuentoSeguro: 0, descuentoOtros: 0 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/trabajadores"] });
          setShowAddTrab(false);
          setNewTrabNombre("");
        },
      }
    );
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Control Mano de Obra</h1>
            <p className="text-muted-foreground mt-1">Registra y distribuye los cobros de servicios entre mecánicos.</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            <Plus className="w-5 h-5" />
            Registrar Servicio
          </button>
        </div>

        {/* Workers management */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xl">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-bold text-foreground">Gestión de Trabajadores</h3>
            </div>
            <button
              onClick={() => { setShowAddTrab(!showAddTrab); setNewTrabNombre(""); }}
              className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground rounded-xl border border-border hover:bg-muted/80 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Agregar
            </button>
          </div>

          {showAddTrab && (
            <div className="flex gap-3 mb-5 animate-in fade-in slide-in-from-top-2">
              <input
                autoFocus type="text" placeholder="Nombre del nuevo trabajador"
                value={newTrabNombre} onChange={(e) => setNewTrabNombre(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTrab()}
                className="flex-1 bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
              />
              <button onClick={handleAddTrab} disabled={crearTrabMutation.isPending} className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors text-sm">Guardar</button>
              <button onClick={() => setShowAddTrab(false)} className="px-4 py-2.5 bg-muted text-foreground rounded-xl font-medium hover:bg-muted/80 transition-colors text-sm border border-border">Cancelar</button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {trabajadores?.map((t) => (
              <div key={t.id} className="bg-background rounded-xl border border-border p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary flex-shrink-0">
                  {t.nombre.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  {editingTrab === t.id ? (
                    <input
                      autoFocus type="text" value={editNombre}
                      onChange={(e) => setEditNombre(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveTrab(t.id); if (e.key === "Escape") setEditingTrab(null); }}
                      className="w-full bg-card border border-primary px-3 py-1.5 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                    />
                  ) : (
                    <div>
                      <p className="font-medium text-foreground">{t.nombre}</p>
                      <p className="text-xs text-muted-foreground">Trabajador #{t.id}</p>
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0 flex gap-1">
                  {editingTrab === t.id ? (
                    <>
                      <button onClick={() => handleSaveTrab(t.id)} disabled={actualizarTrabMutation.isPending} className="p-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingTrab(null)} className="p-1.5 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors"><X className="w-4 h-4" /></button>
                    </>
                  ) : (
                    <button onClick={() => handleStartEdit(t)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Service form */}
        {showForm && (
          <div className="bg-card border border-border p-6 rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-display font-bold text-foreground">Nuevo Registro de Mano de Obra</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Descripción del Servicio</label>
                  <input
                    required type="text" value={formData.descripcion}
                    onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                    placeholder="Ej: Cambio de pastillas"
                    className="w-full bg-background border border-border px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Valor Cobrado Total ($)</label>
                  <input
                    required type="number" value={formData.valorTotal}
                    onChange={(e) => handleValorTotalChange(e.target.value)}
                    placeholder="50000"
                    className="w-full bg-background border border-border px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
              </div>

              {/* Worker selection with manual values */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-3">
                  Trabajadores involucrados
                  <span className="ml-2 text-xs text-muted-foreground">(selecciona y ajusta el valor de cada uno)</span>
                </label>
                <div className="flex flex-wrap gap-3 mb-4">
                  {trabajadores?.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTrabajador(t.id)}
                      className={`px-4 py-2 rounded-xl border transition-all ${
                        formData.trabajadoresIds.includes(t.id)
                          ? "bg-primary/20 border-primary text-primary"
                          : "bg-background border-border text-muted-foreground hover:border-muted-foreground"
                      }`}
                    >
                      {t.nombre}
                    </button>
                  ))}
                </div>

                {/* Individual value inputs */}
                {formData.trabajadoresIds.length > 0 && (
                  <div className="bg-background rounded-xl border border-border divide-y divide-border overflow-hidden">
                    {formData.trabajadoresIds.map((id) => {
                      const t = trabajadores?.find((w) => w.id === id);
                      return (
                        <div key={id} className="flex items-center gap-4 px-4 py-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm flex-shrink-0">
                            {(t?.nombre || "?").charAt(0).toUpperCase()}
                          </div>
                          <span className="flex-1 text-sm font-medium text-foreground">{t?.nombre || `Trabajador ${id}`}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">$</span>
                            <input
                              type="number"
                              value={trabajadorValores[id] || ""}
                              onChange={(e) => setTrabajadorValores((prev) => ({ ...prev, [id]: e.target.value }))}
                              className="w-32 bg-card border border-border px-3 py-1.5 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none text-right"
                              placeholder="0"
                            />
                          </div>
                        </div>
                      );
                    })}
                    {/* Sum row */}
                    <div className={`flex items-center justify-between px-4 py-2 ${sumDiffers ? "bg-destructive/10" : "bg-green-500/5"}`}>
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Suma distribuida</span>
                      <span className={`text-sm font-bold ${sumDiffers ? "text-destructive" : "text-green-500"}`}>
                        {formatCurrency(sumDistribucion)} {sumDiffers ? `(faltan ${formatCurrency(totalValor - sumDistribucion)})` : "✓"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-4 border-t border-border">
                <button
                  type="submit"
                  disabled={crearMutation.isPending || crearVentaMutation.isPending || sumDiffers}
                  className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all disabled:opacity-50"
                >
                  <Save className="w-5 h-5" />
                  Guardar y Enviar a Ventas
                </button>
              </div>
            </form>
          </div>
        )}

        {/* History table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Wrench className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-foreground">Historial de Servicios</h3>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted text-muted-foreground text-sm border-b border-border">
                <th className="px-6 py-4 font-medium">Fecha</th>
                <th className="px-6 py-4 font-medium">Servicio</th>
                <th className="px-6 py-4 font-medium">Valor Total</th>
                <th className="px-6 py-4 font-medium">Distribución</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Cargando registros...</td></tr>
              ) : manoObras?.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No hay servicios registrados aún.</td></tr>
              ) : (
                manoObras?.map((mo) => (
                  <tr key={mo.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 text-muted-foreground text-sm">
                      {new Date(mo.fecha + "T12:00:00").toLocaleDateString("es-CO")}
                    </td>
                    <td className="px-6 py-4 font-medium text-foreground">{mo.descripcion}</td>
                    <td className="px-6 py-4 text-primary font-bold">{formatCurrency(mo.valorTotal)}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
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
          </table>
        </div>
      </div>
    </Layout>
  );
}
