import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import {
  useGetCreditos,
  useCrearCredito,
  useActualizarCredito,
  useEliminarCredito,
  useAbonarCredito,
  useGetInventario,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Plus, Trash2, X, Pencil, Search, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const TIPO = "nosdebe";

interface LineaInput {
  id: number;
  productoId?: number | null;
  productoCodigo?: string | null;
  cantidad: string;
  productoNombre: string;
  marca: string;
  precioVenta: string;
  precioCompra: string;
  valorAbonado?: number;
}

const emptyForm = {
  fechaFactura: new Date().toISOString().split("T")[0],
  nombreCliente: "",
  telefonoCliente: "",
  valorAbonado: "0",
};

export default function NosDebePage() {
  const { data: creditos, isLoading } = useGetCreditos({ tipo: TIPO });
  const { data: productos } = useGetInventario();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [lineas, setLineas] = useState<LineaInput[]>([
    { id: -1, cantidad: "1", productoNombre: "", marca: "", precioVenta: "", precioCompra: "0" },
  ]);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [showPay, setShowPay] = useState<number | null>(null);
  const [abono, setAbono] = useState("");
  const [lineasSeleccionadas, setLineasSeleccionadas] = useState<number[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [expandedAbonos, setExpandedAbonos] = useState<Set<number>>(new Set());

  const crearMutation = useCrearCredito();
  const actualizarMutation = useActualizarCredito();
  const eliminarMutation = useEliminarCredito();
  const abonarMutation = useAbonarCredito();

  const addLinea = () =>
    setLineas((prev) => [...prev, { id: -Date.now(), cantidad: "1", productoNombre: "", marca: "", precioVenta: "", precioCompra: "0" }]);
  const removeLinea = (id: number) => { if (lineas.length > 1) setLineas((prev) => prev.filter((l) => l.id !== id)); };
  const updateLinea = (id: number, field: keyof LineaInput, value: string) =>
    setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));

  const totalLineas = lineas.reduce((sum, l) => sum + (parseFloat(l.cantidad) || 0) * (parseFloat(l.precioVenta) || 0), 0);

  const openNew = () => {
    setEditingId(null);
    setShowForm(true);
    setForm({ ...emptyForm });
    setLineas([{ id: -Date.now(), cantidad: "1", productoNombre: "", marca: "", precioVenta: "", precioCompra: "0" }]);
    setFormErrors([]);
  };

  const openEdit = (c: any) => {
    setEditingId(c.id);
    setShowForm(true);
    setForm({ fechaFactura: c.fechaFactura, nombreCliente: c.nombreCliente, telefonoCliente: c.telefonoCliente || "", valorAbonado: String(c.valorAbonado || 0) });
    setLineas(c.lineas.length
      ? c.lineas.map((l: any) => ({ id: l.id, productoId: l.productoId, productoCodigo: l.productoCodigo, cantidad: String(l.cantidad), productoNombre: l.productoNombre, marca: l.productoMarca || "", precioVenta: String(l.precioVenta), precioCompra: String(l.precioCompra || 0), valorAbonado: l.valorAbonado }))
      : [{ id: -Date.now(), cantidad: "1", productoNombre: "", marca: "", precioVenta: "", precioCompra: "0" }]);
    setFormErrors([]);
  };

  const handleGuardar = () => {
    const errors: string[] = [];
    if (!form.nombreCliente.trim()) errors.push("El nombre es obligatorio");
    if (!form.fechaFactura) errors.push("La fecha es obligatoria");
    if (totalLineas <= 0) errors.push("Agrega al menos un producto con precio");
    if (errors.length) { setFormErrors(errors); return; }
    setFormErrors([]);

    const initialAbono = Math.min(totalLineas, parseFloat(form.valorAbonado) || 0);
    let remaining = initialAbono;
    const payloadLineas = lineas
      .filter((l) => l.productoNombre.trim() && parseFloat(l.precioVenta) > 0)
      .map((l) => {
        const total = (parseFloat(l.cantidad) || 0) * (parseFloat(l.precioVenta) || 0);
        const applied = editingId ? (l.valorAbonado || 0) : Math.min(total, remaining);
        if (!editingId) remaining -= applied;
        return {
          id: l.id > 0 ? l.id : undefined,
          productoId: l.productoId, productoCodigo: l.productoCodigo,
          cantidad: parseFloat(l.cantidad) || 0, productoNombre: l.productoNombre,
          productoMarca: l.marca || undefined,
          precioVenta: parseFloat(l.precioVenta) || 0,
          precioCompra: parseFloat(l.precioCompra) || 0,
          valorAbonado: applied,
        };
      });

    const data = {
      tipo: TIPO,
      fechaFactura: form.fechaFactura, nombreCliente: form.nombreCliente,
      telefonoCliente: form.telefonoCliente || undefined,
      valorCredito: totalLineas,
      valorAbonado: editingId ? parseFloat(form.valorAbonado) || 0 : initialAbono,
      lineas: payloadLineas,
    };

    const options = {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/creditos"] });
        setShowForm(false); setEditingId(null);
        setForm({ ...emptyForm });
        setLineas([{ id: -Date.now(), cantidad: "1", productoNombre: "", marca: "", precioVenta: "", precioCompra: "0" }]);
      },
    };
    if (editingId) actualizarMutation.mutate({ id: editingId, data }, options);
    else crearMutation.mutate({ data }, options);
  };

  const handleAbono = (c: any) => {
    const abonoNum = parseFloat(abono);
    if (!abonoNum || abonoNum <= 0) { alert("Valor inválido"); return; }
    if (abonoNum > c.valorRestante) { alert(`El abono no puede superar ${formatCurrency(c.valorRestante)}`); return; }
    if (!lineasSeleccionadas.length) { alert("Selecciona al menos un producto"); return; }
    const selected = c.lineas.filter((l: any) => lineasSeleccionadas.includes(l.id) && l.valorRestante > 0);
    let rem = abonoNum;
    const lineasAbono = selected.map((l: any) => {
      const v = Math.min(l.valorRestante, rem);
      rem -= v;
      return { lineaId: l.id, valor: v };
    }).filter((la: any) => la.valor > 0);

    abonarMutation.mutate({ id: c.id, data: { valor: abonoNum, lineas: lineasAbono } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/creditos"] });
        setShowPay(null); setAbono(""); setLineasSeleccionadas([]);
      },
    });
  };

  const handleEliminar = (id: number) => {
    if (confirm("¿Eliminar este registro?")) {
      eliminarMutation.mutate({ id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/creditos"] }) });
    }
  };

  const toggleExpandAbonos = (id: number) => {
    setExpandedAbonos((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const q = busqueda.toLowerCase();
  const allCreditos = useMemo(() => {
    if (!creditos) return [];
    return creditos.filter((c) => !q || c.nombreCliente.toLowerCase().includes(q) || (c.telefonoCliente || "").includes(q));
  }, [creditos, q]);

  const pendientes = allCreditos.filter((c) => c.valorRestante > 0);
  const pagados = allCreditos.filter((c) => c.valorRestante <= 0);

  // Group pendientes by month
  const porMes = useMemo(() => {
    const map = new Map<string, typeof pendientes>();
    pendientes.forEach((c) => {
      const mes = c.fechaFactura.slice(0, 7); // "2024-12"
      if (!map.has(mes)) map.set(mes, []);
      map.get(mes)!.push(c);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([mes, items]) => ({
        mes,
        label: new Date(mes + "-15").toLocaleDateString("es-CO", { year: "numeric", month: "long" }),
        items: items.sort((a, b) => b.fechaFactura.localeCompare(a.fechaFactura)),
      }));
  }, [pendientes]);

  const totalDeben = pendientes.reduce((s, c) => s + c.valorRestante, 0);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Nos Debe</h1>
            <p className="text-muted-foreground mt-1 text-sm">Registro de deudas internas — personas del mismo lugar de trabajo.</p>
          </div>
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-lg text-sm">
            <Plus className="w-4 h-4" /> Nuevo Registro
          </button>
        </div>

        {totalDeben > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <p className="text-sm font-medium text-destructive">Total pendiente por cobrar</p>
            <p className="text-2xl font-display font-bold text-destructive">{formatCurrency(totalDeben)}</p>
          </div>
        )}

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Buscar por nombre o teléfono..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
          {busqueda && <button onClick={() => setBusqueda("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>}
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-4">
            <div className="px-6 py-4 border-b border-border bg-muted/50 flex justify-between items-center">
              <h3 className="text-lg font-display font-bold">{editingId ? "Editar" : "Nuevo"} Registro</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6 space-y-4">
              {formErrors.length > 0 && <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3">{formErrors.map((e, i) => <p key={i} className="text-destructive text-sm">• {e}</p>)}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Nombre <span className="text-destructive">*</span></label>
                  <input type="text" value={form.nombreCliente} onChange={(e) => setForm({ ...form, nombreCliente: e.target.value })} className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Fecha <span className="text-destructive">*</span></label>
                  <input type="date" value={form.fechaFactura} onChange={(e) => setForm({ ...form, fechaFactura: e.target.value })} className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Teléfono</label>
                  <input type="text" value={form.telefonoCliente} onChange={(e) => setForm({ ...form, telefonoCliente: e.target.value })} className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
                </div>
              </div>

              {/* Product lines */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Productos / Servicios</label>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[500px]">
                    <thead><tr className="bg-muted text-muted-foreground border-b border-border text-xs">
                      <th className="px-3 py-2 font-medium">Producto / Servicio</th>
                      <th className="px-3 py-2 font-medium w-16">Cant</th>
                      <th className="px-3 py-2 font-medium w-28">P. Compra</th>
                      <th className="px-3 py-2 font-medium w-28">P. Venta</th>
                      <th className="px-3 py-2 font-medium w-20">Total</th>
                      <th className="px-3 py-2 w-6"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {lineas.map((linea) => (
                        <tr key={linea.id}>
                          <td className="px-3 py-2">
                            <input type="text" placeholder="Descripción..." value={linea.productoNombre}
                              onChange={(e) => updateLinea(linea.id, "productoNombre", e.target.value)}
                              list={`prod-list-nd-${linea.id}`}
                              className="w-full bg-background border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" />
                            <datalist id={`prod-list-nd-${linea.id}`}>
                              {productos?.map((p) => <option key={p.id} value={p.nombre} />)}
                            </datalist>
                          </td>
                          <td className="px-3 py-2"><input type="number" min="1" value={linea.cantidad} onChange={(e) => updateLinea(linea.id, "cantidad", e.target.value)} className="w-full bg-background border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none text-center" /></td>
                          <td className="px-3 py-2"><input type="number" min="0" value={linea.precioCompra} onChange={(e) => updateLinea(linea.id, "precioCompra", e.target.value)} className="w-full bg-background border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" /></td>
                          <td className="px-3 py-2"><input type="number" min="0" value={linea.precioVenta} onChange={(e) => updateLinea(linea.id, "precioVenta", e.target.value)} className="w-full bg-background border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" /></td>
                          <td className="px-3 py-2 text-xs font-bold text-primary">{formatCurrency((parseFloat(linea.cantidad) || 0) * (parseFloat(linea.precioVenta) || 0))}</td>
                          <td className="px-3 py-2"><button type="button" onClick={() => removeLinea(linea.id)} disabled={lineas.length === 1} className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"><X className="w-3.5 h-3.5" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-border bg-muted/30">
                      <tr><td colSpan={4} className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Total</td>
                        <td className="px-3 py-2 font-bold text-primary text-xs">{formatCurrency(totalLineas)}</td><td></td></tr>
                    </tfoot>
                  </table>
                </div>
                <button type="button" onClick={addLinea} className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"><Plus className="w-3.5 h-3.5" />Agregar producto</button>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Abono Inicial ($)</label>
                <input type="number" placeholder="0" value={form.valorAbonado} onChange={(e) => setForm({ ...form, valorAbonado: e.target.value })} className="w-40 bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
              </div>

              <div className="flex gap-3 justify-end border-t border-border pt-4">
                <button onClick={() => setShowForm(false)} className="px-5 py-2.5 bg-muted text-foreground rounded-xl font-medium text-sm hover:bg-muted/80">Cancelar</button>
                <button onClick={handleGuardar} disabled={crearMutation.isPending || actualizarMutation.isPending} className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 shadow-md">
                  {crearMutation.isPending || actualizarMutation.isPending ? "Guardando..." : `${editingId ? "Actualizar" : "Guardar"} — ${formatCurrency(totalLineas)}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pendientes grouped by month */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Cargando...</div>
        ) : pendientes.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-2xl border border-border">
            <p className="text-muted-foreground text-sm">{busqueda ? "Sin resultados." : "No hay registros pendientes. ✓"}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {porMes.map(({ mes, label, items }) => (
              <div key={mes}>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-destructive inline-block"></span>
                  {label} ({items.length})
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {items.map((c) => (
                    <div key={c.id} className="bg-card border border-destructive/30 rounded-2xl p-5 shadow-md flex flex-col">
                      <div className="flex justify-between items-start mb-3">
                        <div className="min-w-0">
                          <h3 className="font-bold text-foreground truncate">{c.nombreCliente}</h3>
                          <p className="text-xs text-muted-foreground">{new Date(c.fechaFactura + "T12:00:00").toLocaleDateString("es-CO")}</p>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0 ml-2">
                          <button onClick={() => openEdit(c)} className="p-1 text-muted-foreground hover:text-primary rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleEliminar(c.id)} className="p-1 text-muted-foreground hover:text-destructive rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>

                      <div className="text-sm space-y-1 flex-1">
                        {c.telefonoCliente && <p className="text-xs text-muted-foreground">Tel: {c.telefonoCliente}</p>}
                        <div className="flex justify-between border-t border-border/50 pt-1.5 mt-2">
                          <span className="text-xs text-muted-foreground">Total:</span>
                          <span className="text-xs font-medium">{formatCurrency(c.valorCredito)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">Abonado:</span>
                          <span className="text-xs text-green-500 font-medium">{formatCurrency(c.valorAbonado)}</span>
                        </div>
                        <div className="flex justify-between border-t border-border font-bold pt-1.5">
                          <span>Saldo:</span>
                          <span className="text-destructive">{formatCurrency(c.valorRestante)}</span>
                        </div>
                      </div>

                      {/* Payment history */}
                      {c.abonos && c.abonos.length > 0 && (
                        <div className="mt-3">
                          <button onClick={() => toggleExpandAbonos(c.id)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors w-full">
                            <Clock className="w-3 h-3" />
                            Ver historial de pagos ({c.abonos.length})
                            {expandedAbonos.has(c.id) ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                          </button>
                          {expandedAbonos.has(c.id) && (
                            <div className="mt-2 space-y-1 animate-in fade-in">
                              {c.abonos.map((a) => (
                                <div key={a.id} className="flex justify-between items-center text-xs bg-muted/30 px-2 py-1 rounded-lg">
                                  <span className="text-muted-foreground">{new Date(a.fecha + "T12:00:00").toLocaleDateString("es-CO")}</span>
                                  <span className="font-medium text-green-500">+{formatCurrency(a.valorTotal)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {showPay === c.id ? (
                        <div className="bg-background rounded-xl p-3 border border-border mt-3 animate-in fade-in">
                          <h4 className="text-xs font-semibold mb-2 text-foreground">Registrar Abono</h4>
                          <input type="number" placeholder={`Máx ${formatCurrency(c.valorRestante)}`} value={abono}
                            onChange={(e) => setAbono(e.target.value)}
                            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm mb-2 focus:ring-1 focus:ring-primary outline-none" />
                          {c.lineas.length > 0 && (
                            <div className="space-y-1 mb-2">
                              {c.lineas.map((l: any) => (
                                <label key={l.id} className="flex items-center justify-between gap-2 text-xs cursor-pointer">
                                  <span className="flex items-center gap-1.5">
                                    <input type="checkbox" checked={lineasSeleccionadas.includes(l.id)} disabled={l.valorRestante <= 0}
                                      onChange={() => setLineasSeleccionadas((prev) => prev.includes(l.id) ? prev.filter((id) => id !== l.id) : [...prev, l.id])}
                                      className="w-3.5 h-3.5 accent-primary" />
                                    <span className="truncate">{l.productoNombre}</span>
                                  </span>
                                  <span className="text-muted-foreground shrink-0">{formatCurrency(l.valorRestante)}</span>
                                </label>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button onClick={() => setShowPay(null)} className="flex-1 py-1.5 bg-muted text-foreground rounded-lg text-xs font-medium">Cancelar</button>
                            <button onClick={() => handleAbono(c)} disabled={abonarMutation.isPending} className="flex-1 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium">Confirmar</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setShowPay(c.id); setAbono(""); setLineasSeleccionadas([]); }}
                          className="w-full mt-3 py-2 bg-secondary text-secondary-foreground rounded-xl font-medium border border-border text-sm hover:bg-secondary/80 transition-colors">
                          Abonar / Pagar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagados */}
        {pagados.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
              Saldados ({pagados.length})
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {pagados.map((c) => (
                <div key={c.id} className="bg-card border border-green-500/30 rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div><p className="font-medium text-foreground">{c.nombreCliente}</p>
                      <p className="text-xs text-muted-foreground">{new Date(c.fechaFactura + "T12:00:00").toLocaleDateString("es-CO")} · {formatCurrency(c.valorCredito)}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <span className="text-xs text-green-500 font-bold bg-green-500/10 px-2 py-0.5 rounded-full">Saldado ✓</span>
                      <button onClick={() => openEdit(c)} className="p-1 text-muted-foreground hover:text-primary rounded"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleEliminar(c.id)} className="p-1 text-muted-foreground hover:text-destructive rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  {c.abonos && c.abonos.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {c.abonos.slice(0, 3).map((a) => (
                        <div key={a.id} className="flex justify-between text-xs text-muted-foreground">
                          <span>{new Date(a.fecha + "T12:00:00").toLocaleDateString("es-CO")}</span>
                          <span className="text-green-500">+{formatCurrency(a.valorTotal)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
