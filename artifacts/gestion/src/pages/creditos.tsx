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
import { Plus, Trash2, X, Pencil, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface LineaCredito {
  id: number;
  productoId?: number | null;
  productoCodigo?: string | null;
  cantidad: string;
  productoNombre: string;
  marca: string;
  precioVenta: string;
  valorAbonado?: number;
}

const emptyForm = {
  fechaFactura: new Date().toISOString().split("T")[0],
  placaVehiculo: "",
  nombreCliente: "",
  telefonoCliente: "",
  valorAbonado: "0",
};

export default function Creditos() {
  const { data: creditos, isLoading } = useGetCreditos();
  const { data: productos } = useGetInventario();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingCreditoId, setEditingCreditoId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [lineas, setLineas] = useState<LineaCredito[]>([
    { id: -1, cantidad: "1", productoNombre: "", marca: "", precioVenta: "" },
  ]);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const [showPay, setShowPay] = useState<number | null>(null);
  const [abono, setAbono] = useState("");
  const [lineasSeleccionadas, setLineasSeleccionadas] = useState<number[]>([]);

  // Search
  const [busqueda, setBusqueda] = useState("");

  const crearMutation = useCrearCredito();
  const actualizarMutation = useActualizarCredito();
  const eliminarMutation = useEliminarCredito();
  const abonarMutation = useAbonarCredito();

  const addLinea = () => {
    setLineas((prev) => [
      ...prev,
      { id: -Date.now(), cantidad: "1", productoNombre: "", marca: "", precioVenta: "" },
    ]);
  };

  const removeLinea = (id: number) => {
    if (lineas.length === 1) return;
    setLineas((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLinea = (id: number, field: keyof LineaCredito, value: string) => {
    setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  };

  const handleSelectProducto = (lineaId: number, productoId: string) => {
    const prod = productos?.find((p) => String(p.id) === productoId);
    if (prod) {
      setLineas((prev) =>
        prev.map((l) =>
          l.id === lineaId
            ? { ...l, productoId: prod.id, productoCodigo: prod.codigo, productoNombre: prod.nombre, marca: prod.marca || "", precioVenta: String(prod.precioVentaConIva) }
            : l
        )
      );
    }
  };

  const totalLineas = lineas.reduce((sum, l) => {
    const cant = parseFloat(l.cantidad) || 0;
    const precio = parseFloat(l.precioVenta) || 0;
    return sum + cant * precio;
  }, 0);

  const openNewCredit = () => {
    setEditingCreditoId(null);
    setShowForm(true);
    setForm({ ...emptyForm });
    setLineas([{ id: -Date.now(), cantidad: "1", productoNombre: "", marca: "", precioVenta: "" }]);
    setFormErrors([]);
  };

  const openEditCredit = (credito: any) => {
    setEditingCreditoId(credito.id);
    setShowForm(true);
    setForm({
      fechaFactura: credito.fechaFactura,
      placaVehiculo: credito.placaVehiculo || "",
      nombreCliente: credito.nombreCliente,
      telefonoCliente: credito.telefonoCliente || "",
      valorAbonado: String(credito.valorAbonado || 0),
    });
    setLineas(
      credito.lineas.length
        ? credito.lineas.map((linea: any) => ({
            id: linea.id,
            productoId: linea.productoId,
            productoCodigo: linea.productoCodigo,
            cantidad: String(linea.cantidad),
            productoNombre: linea.productoNombre,
            marca: linea.productoMarca || "",
            precioVenta: String(linea.precioVenta),
            valorAbonado: linea.valorAbonado,
          }))
        : [{ id: -Date.now(), cantidad: "1", productoNombre: "", marca: "", precioVenta: "" }],
    );
    setFormErrors([]);
  };

  const handleGuardar = () => {
    const errors: string[] = [];
    if (!form.nombreCliente.trim()) errors.push("El nombre del cliente es obligatorio");
    if (!form.fechaFactura) errors.push("La fecha es obligatoria");
    if (totalLineas <= 0) errors.push("Agrega al menos un producto con precio");
    if (errors.length) { setFormErrors(errors); return; }
    setFormErrors([]);

    const descripcion = lineas
      .filter((l) => l.productoNombre)
      .map((l) => `${l.cantidad}x ${l.productoNombre}${l.marca ? ` (${l.marca})` : ""} @ ${formatCurrency(parseFloat(l.precioVenta) || 0)}`)
      .join(" | ");

    const initialAbono = Math.min(totalLineas, parseFloat(form.valorAbonado) || 0);
    let remainingInitial = initialAbono;
    const payloadLineas = lineas
      .filter((linea) => linea.productoNombre.trim() && parseFloat(linea.precioVenta) > 0)
      .map((linea) => {
        const total = (parseFloat(linea.cantidad) || 0) * (parseFloat(linea.precioVenta) || 0);
        const applied = editingCreditoId ? (linea.valorAbonado || 0) : Math.min(total, remainingInitial);
        if (!editingCreditoId) remainingInitial -= applied;
        return {
          id: linea.id > 0 ? linea.id : undefined,
          productoId: linea.productoId,
          productoCodigo: linea.productoCodigo,
          cantidad: parseFloat(linea.cantidad) || 0,
          productoNombre: linea.productoNombre,
          productoMarca: linea.marca || undefined,
          precioVenta: parseFloat(linea.precioVenta) || 0,
          valorAbonado: applied,
        };
      });
    const data = {
      fechaFactura: form.fechaFactura,
      placaVehiculo: form.placaVehiculo || undefined,
      nombreCliente: form.nombreCliente,
      telefonoCliente: form.telefonoCliente || undefined,
      descripcion: descripcion || undefined,
      valorCredito: totalLineas,
      valorAbonado: editingCreditoId ? parseFloat(form.valorAbonado) || 0 : initialAbono,
      lineas: payloadLineas,
    };

    const options = {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/creditos"] });
        setShowForm(false);
        setEditingCreditoId(null);
        setForm({ ...emptyForm });
        setLineas([{ id: -Date.now(), cantidad: "1", productoNombre: "", marca: "", precioVenta: "" }]);
      },
    };
    if (editingCreditoId) actualizarMutation.mutate({ id: editingCreditoId, data }, options);
    else crearMutation.mutate({ data }, options);
  };

  const handleAbono = (credito: any) => {
    const abonoNum = parseFloat(abono);
    if (!abonoNum || abonoNum <= 0) { alert("Valor de abono inválido"); return; }
    if (abonoNum > credito.valorRestante) {
      alert(`El abono no puede superar el saldo de ${formatCurrency(credito.valorRestante)}`);
      return;
    }
    const selected = credito.lineas.filter((linea: any) => lineasSeleccionadas.includes(linea.id));
    if (!selected.length) { alert("Selecciona al menos un producto para abonar"); return; }
    let remaining = abonoNum;
    const lineasAbono = selected.map((linea: any) => {
      const value = Math.min(linea.valorRestante, remaining);
      remaining -= value;
      return { lineaId: linea.id, valor: value };
    }).filter((la: any) => la.valor > 0);

    abonarMutation.mutate(
      { id: credito.id, data: { valor: abonoNum, lineas: lineasAbono } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/creditos"] });
          setShowPay(null);
          setAbono("");
          setLineasSeleccionadas([]);
        },
      }
    );
  };

  const handleEliminar = (id: number) => {
    if (confirm("¿Eliminar este crédito?")) {
      eliminarMutation.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/creditos"] }),
      });
    }
  };

  // Filtered and separated credits
  const q = busqueda.toLowerCase();
  const allCreditos = useMemo(() => {
    if (!creditos) return [];
    if (!q) return creditos;
    return creditos.filter((c) =>
      c.nombreCliente.toLowerCase().includes(q) ||
      (c.placaVehiculo || "").toLowerCase().includes(q) ||
      (c.telefonoCliente || "").toLowerCase().includes(q)
    );
  }, [creditos, q]);

  const pendientes = allCreditos.filter((c) => c.valorRestante > 0);
  const pagados = allCreditos.filter((c) => c.valorRestante <= 0);

  const totalDeben = pendientes.reduce((s, c) => s + c.valorRestante, 0);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Créditos</h1>
            <p className="text-muted-foreground mt-1 text-sm">Gestión de créditos y cobros pendientes.</p>
          </div>
          <button
            onClick={openNewCredit}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-lg text-sm"
          >
            <Plus className="w-4 h-4" />
            Nuevo Crédito
          </button>
        </div>

        {/* Total banner */}
        {totalDeben > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <p className="text-sm font-medium text-destructive">Total que nos deben</p>
            <p className="text-2xl font-display font-bold text-destructive">{formatCurrency(totalDeben)}</p>
          </div>
        )}

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por cliente, placa o teléfono..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
          />
          {busqueda && (
            <button onClick={() => setBusqueda("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-4">
            <div className="px-6 py-4 border-b border-border bg-muted/50 flex justify-between items-center">
              <h3 className="text-lg font-display font-bold text-foreground">
                {editingCreditoId ? "Editar Crédito" : "Nuevo Crédito"}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {formErrors.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4">
                  {formErrors.map((e, i) => <p key={i} className="text-destructive text-sm">• {e}</p>)}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Nombre Cliente <span className="text-destructive">*</span></label>
                  <input type="text" value={form.nombreCliente} onChange={(e) => setForm({ ...form, nombreCliente: e.target.value })} className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Fecha <span className="text-destructive">*</span></label>
                  <input type="date" value={form.fechaFactura} onChange={(e) => setForm({ ...form, fechaFactura: e.target.value })} className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Placa Vehículo</label>
                  <input type="text" value={form.placaVehiculo} onChange={(e) => setForm({ ...form, placaVehiculo: e.target.value })} className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Teléfono</label>
                  <input type="text" value={form.telefonoCliente} onChange={(e) => setForm({ ...form, telefonoCliente: e.target.value })} className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
                </div>
              </div>

              {/* Product lines */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Productos</label>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="bg-muted text-muted-foreground border-b border-border">
                        <th className="px-3 py-2 font-medium text-xs">Producto</th>
                        <th className="px-3 py-2 font-medium text-xs w-20">Cant</th>
                        <th className="px-3 py-2 font-medium text-xs w-32">P. Venta</th>
                        <th className="px-3 py-2 font-medium text-xs w-24">Total</th>
                        <th className="px-3 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {lineas.map((linea) => (
                        <tr key={linea.id}>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              placeholder="Nombre del producto..."
                              value={linea.productoNombre}
                              onChange={(e) => updateLinea(linea.id, "productoNombre", e.target.value)}
                              list={`prod-list-${linea.id}`}
                              className="w-full bg-background border border-border px-3 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none"
                            />
                            <datalist id={`prod-list-${linea.id}`}>
                              {productos?.map((p) => (
                                <option key={p.id} value={p.nombre} onClick={() => handleSelectProducto(linea.id, String(p.id))} />
                              ))}
                            </datalist>
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min="1" step="0.01" value={linea.cantidad} onChange={(e) => updateLinea(linea.id, "cantidad", e.target.value)} className="w-full bg-background border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none text-center" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min="0" value={linea.precioVenta} onChange={(e) => updateLinea(linea.id, "precioVenta", e.target.value)} className="w-full bg-background border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" />
                          </td>
                          <td className="px-3 py-2 font-medium text-primary text-xs">
                            {formatCurrency((parseFloat(linea.cantidad) || 0) * (parseFloat(linea.precioVenta) || 0))}
                          </td>
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => removeLinea(linea.id)} disabled={lineas.length === 1} className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-border bg-muted/30">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Total crédito</td>
                        <td className="px-3 py-2 font-bold text-primary">{formatCurrency(totalLineas)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <button type="button" onClick={addLinea} className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                  Agregar producto
                </button>
              </div>

              <div className="mb-5">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Abono Inicial ($)</label>
                <input type="number" placeholder="0" value={form.valorAbonado} onChange={(e) => setForm({ ...form, valorAbonado: e.target.value })} className="w-48 bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
              </div>

              <div className="flex gap-3 justify-end border-t border-border pt-4">
                <button onClick={() => setShowForm(false)} className="px-5 py-2.5 bg-muted text-foreground rounded-xl font-medium hover:bg-muted/80 transition-colors text-sm">Cancelar</button>
                <button onClick={handleGuardar} disabled={crearMutation.isPending || actualizarMutation.isPending} className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors shadow-md text-sm">
                  {crearMutation.isPending || actualizarMutation.isPending ? "Guardando..." : `${editingCreditoId ? "Actualizar" : "Guardar"} Crédito — ${formatCurrency(totalLineas)}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PENDIENTES ── */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-destructive inline-block"></span>
            Pendientes de pago ({pendientes.length})
          </h2>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Cargando créditos...</div>
          ) : pendientes.length === 0 ? (
            <div className="text-center py-10 bg-card rounded-2xl border border-border">
              <p className="text-muted-foreground text-sm">{busqueda ? "Sin resultados para esa búsqueda." : "No hay créditos pendientes. ✓"}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {pendientes.map((credito) => (
                <div key={credito.id} className="bg-card border border-border rounded-2xl p-5 shadow-md hover:shadow-xl transition-all flex flex-col">
                  <div className="flex justify-between items-start mb-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-foreground truncate">{credito.nombreCliente}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(credito.fechaFactura + "T12:00:00").toLocaleDateString("es-CO")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      <span className="bg-destructive/10 text-destructive text-xs font-bold px-2 py-0.5 rounded-full uppercase">Pendiente</span>
                      <button onClick={() => openEditCredit(credito)} className="p-1 text-muted-foreground hover:text-primary rounded-lg" title="Editar crédito">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleEliminar(credito.id)} className="p-1 text-muted-foreground hover:text-destructive rounded-lg">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1 mb-4 flex-1 text-sm">
                    {credito.placaVehiculo && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground text-xs">Placa:</span>
                        <span className="font-medium text-xs">{credito.placaVehiculo}</span>
                      </div>
                    )}
                    {credito.telefonoCliente && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground text-xs">Tel:</span>
                        <span className="text-xs">{credito.telefonoCliente}</span>
                      </div>
                    )}
                    {credito.descripcion && (
                      <div className="mt-2 p-2 bg-background rounded-lg border border-border">
                        <p className="text-xs text-muted-foreground leading-relaxed">{credito.descripcion}</p>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 mt-1 border-t border-border/50">
                      <span className="text-muted-foreground text-xs">Valor inicial:</span>
                      <span className="font-medium text-xs">{formatCurrency(credito.valorCredito)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-xs">Abonado:</span>
                      <span className="font-medium text-xs text-green-500">{formatCurrency(credito.valorAbonado)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-border font-bold">
                      <span>Saldo:</span>
                      <span className="text-destructive">{formatCurrency(credito.valorRestante)}</span>
                    </div>
                    <div className="mt-3 rounded-lg border border-border bg-background/60 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Productos y saldos</p>
                      {credito.lineas.length > 0 ? credito.lineas.map((linea: any) => (
                        <div key={linea.id} className="flex items-center justify-between gap-3 py-1 text-xs">
                          <span className="min-w-0 truncate text-foreground">{linea.cantidad} × {linea.productoNombre}</span>
                          <span className="shrink-0 text-muted-foreground">{formatCurrency(linea.valorRestante)}</span>
                        </div>
                      )) : (
                        <p className="text-xs text-muted-foreground">Edita el crédito para agregar sus productos.</p>
                      )}
                    </div>
                  </div>

                  {showPay === credito.id ? (
                    <div className="bg-background rounded-xl p-4 border border-border animate-in fade-in">
                      <h4 className="text-sm font-medium mb-3 text-foreground">Registrar Abono</h4>
                      <div className="space-y-3">
                        <input
                          type="number"
                          placeholder={`Monto (max ${formatCurrency(credito.valorRestante)})`}
                          value={abono}
                          onChange={(e) => setAbono(e.target.value)}
                          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <div className="rounded-lg border border-border bg-card p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Productos a pagar</p>
                          {credito.lineas.length > 0 ? credito.lineas.map((linea: any) => (
                            <label key={linea.id} className="flex cursor-pointer items-center justify-between gap-3 border-b border-border py-2 last:border-0">
                              <span className="flex min-w-0 items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={lineasSeleccionadas.includes(linea.id)}
                                  disabled={linea.valorRestante <= 0}
                                  onChange={() => setLineasSeleccionadas((prev) => prev.includes(linea.id) ? prev.filter((id) => id !== linea.id) : [...prev, linea.id])}
                                  className="h-4 w-4 accent-primary"
                                />
                                <span className="truncate">{linea.cantidad} × {linea.productoNombre}</span>
                              </span>
                              <span className="shrink-0 text-xs text-muted-foreground">{formatCurrency(linea.valorRestante)}</span>
                            </label>
                          )) : <p className="text-xs text-muted-foreground">Edita el crédito para registrar sus productos.</p>}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setShowPay(null)} className="flex-1 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80">Cancelar</button>
                          <button onClick={() => handleAbono(credito)} disabled={abonarMutation.isPending || credito.lineas.length === 0} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">Confirmar</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setShowPay(credito.id); setAbono(""); setLineasSeleccionadas([]); }}
                      className="w-full py-2.5 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/80 transition-colors border border-border text-sm"
                    >
                      Abonar / Pagar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── PAGADOS ── */}
        {pagados.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
              Pagados al 100% ({pagados.length})
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {pagados.map((c) => (
                <div key={c.id} className="bg-card border border-green-500/30 rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{c.nombreCliente}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(c.fechaFactura + "T12:00:00").toLocaleDateString("es-CO")} · {formatCurrency(c.valorCredito)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      <span className="text-xs text-green-500 font-bold bg-green-500/10 px-2 py-0.5 rounded-full">Pagado ✓</span>
                      <button onClick={() => openEditCredit(c)} className="p-1 text-muted-foreground hover:text-primary rounded-lg" title="Editar / corregir abono">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleEliminar(c.id)} className="p-1 text-muted-foreground hover:text-destructive rounded-lg">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {c.lineas.length > 0 && (
                    <div className="bg-background rounded-lg border border-border/50 p-2.5 space-y-1">
                      {c.lineas.map((l: any) => (
                        <div key={l.id} className="flex justify-between text-xs text-muted-foreground">
                          <span className="truncate">{l.cantidad} × {l.productoNombre}</span>
                          <span>{formatCurrency(l.precioVenta * l.cantidad)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {c.descripcion && <p className="text-xs text-muted-foreground italic">{c.descripcion}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
