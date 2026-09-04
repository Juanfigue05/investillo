import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import {
  useGetCreditos,
  useCrearCredito,
  useActualizarCredito,
  useEliminarCredito,
  useAbonarCredito,
  useEliminarAbonoCredito,
  useEditarAbonoCredito,
  useGetInventario,
  useGetTrabajadores,
  useGetClientes,
} from "@workspace/api-client-react";
import { formatCurrency, formatTelefono, soloDigitos } from "@/lib/utils";
import { Plus, Trash2, X, Pencil, Search, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ManoObraSelector, calcularDistribucion } from "@/components/ManoObraSelector";
import { encolarOperacion } from "@/lib/offline-db";
import { toast } from "@/hooks/use-toast";
import { esFalloDeRed } from "@/lib/offline-db";
import { SearchableSelect, type ProductoOpcion } from "@/components/SearchableSelect";

const TIPO = "nosdebe";
const MO_NOMBRE = "Mano de Obra";
const IVA_NOMBRE = "IVA (19%)";

function agregarFilaOptimista(queryClient: any, queryKey: readonly unknown[], fila: any) {
  const idTemporal = -Date.now() - Math.random();
  queryClient.setQueryData(queryKey, (old: any[] = []) => [...(old || []), { id: idTemporal, ...fila, _pendiente: true }]);
}

interface ManoObraState {
  activo: boolean;
  valor: string;
  trabajadores: number[];
  fijados: Record<number, number>;   // ← nuevo
  marca: string;
  lineaId?: number;
  valorAbonado?: number;
}

const emptyManoObra: ManoObraState = { activo: false, valor: "", trabajadores: [], fijados: {}, marca: "" };

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
  stockActual?: number | null;
  stockMinimo?: number | null;
}

const emptyForm = {
  fechaFactura: new Date().toISOString().split("T")[0],
  nombreCliente: "",
  telefonoCliente: "",
  placaVehiculo: "",
  valorAbonado: "0",
  descripcion: "",
};

export default function NosDebePage() {
  const { data: creditos, isLoading } = useGetCreditos({ tipo: TIPO });
  const { data: productos } = useGetInventario();
  const { data: trabajadores } = useGetTrabajadores();
  const { data: clientes } = useGetClientes({});
  const queryClient = useQueryClient();

  const [confirmarCancelarPago, setConfirmarCancelarPago] = useState<{ creditoId: number; abonoId: number; monto: number; fecha: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [lineas, setLineas] = useState<LineaInput[]>([
    { id: -1, cantidad: "1", productoNombre: "", marca: "", precioVenta: "", precioCompra: "0" },
  ]);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [showPay, setShowPay] = useState<number | null>(null);
  const [abono, setAbono] = useState("");
  const [abonoFormaPago, setAbonoFormaPago] = useState("efectivo");
  const [lineasSeleccionadas, setLineasSeleccionadas] = useState<number[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [expandedAbonos, setExpandedAbonos] = useState<Set<number>>(new Set());
  const [manoObra, setManoObra] = useState<ManoObraState>({ ...emptyManoObra });
  const [aplicaIva, setAplicaIva] = useState(false);
  const [editingHasAbonos, setEditingHasAbonos] = useState(false);
  const [ivaLinea, setIvaLinea] = useState<{ id?: number; valorAbonado?: number }>({});
  const [editingAbonoId, setEditingAbonoId] = useState<number | null>(null);
  const [showRefModal, setShowRefModal] = useState(false);
  const [pendingAbonoCredit, setPendingAbonoCredit] = useState<any>(null);
  const [refTexto, setRefTexto] = useState("");

  const crearMutation = useCrearCredito();
  const actualizarMutation = useActualizarCredito();
  const eliminarMutation = useEliminarCredito();
  const abonarMutation = useAbonarCredito();
  const eliminarAbonoMutation = useEliminarAbonoCredito();
  const editarAbonoMutation = useEditarAbonoCredito();

  const addLinea = () =>
    setLineas((prev) => [...prev, { id: -Date.now(), cantidad: "1", productoNombre: "", marca: "", precioVenta: "", precioCompra: "0" }]);
  const removeLinea = (id: number) => { if (lineas.length > 1) setLineas((prev) => prev.filter((l) => l.id !== id)); };
  const updateLinea = (id: number, field: keyof LineaInput, value: string) =>
    setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));

  const handleProductoSelect = (lineaId: number, prodId: string) => {
    const prod = productos?.find((p) => String(p.id) === prodId);
    if (prod) {
      const stock = parseFloat(String(prod.stockActual ?? 0)) || 0;
      const minimo = parseFloat(String(prod.stockMinimo ?? 0)) || 0;
      setLineas((prev) => prev.map((l) => {
        if (l.id !== lineaId) return l;
        const esLineaNueva = l.id < 0; // id negativo = línea nueva, no guardada en BD
        return {
          ...l,
          productoId: prod.id,
          productoCodigo: prod.codigo,
          productoNombre: prod.nombre,
          marca: prod.marca || "",
          stockActual: stock,
          stockMinimo: minimo,
          // Solo auto-llenar precios en líneas nuevas; las guardadas mantienen su precio
          ...(esLineaNueva ? {
            precioVenta: String(prod.precioVentaSinIva),
            precioCompra: String(prod.precioCompra),
          } : {}),
        };
      }));
    } else {
      // Clear stock alert if product name doesn't match any product
      setLineas((prev) => prev.map((l) => l.id !== lineaId ? l : { ...l, stockActual: null, stockMinimo: null }));
    }
  };

  const totalLineas = lineas.reduce((sum, l) => sum + (parseFloat(l.cantidad) || 0) * (parseFloat(l.precioVenta) || 0), 0);
  const handleClienteSelect = (nombre: string) => {
    const cliente = clientes?.find((c) => c.nombre === nombre);
    if (cliente) {
      const vehiculos = (cliente as any).vehiculos ?? [];
      const telefonoJunto = [cliente.telefono, (cliente as any).telefono2]
        .filter(Boolean)
        .map((t) => formatTelefono(t as string))
        .join(" - ");
      setForm((prev) => ({
        ...prev,
        nombreCliente: cliente.nombre,
        telefonoCliente: telefonoJunto || prev.telefonoCliente,
        placaVehiculo: vehiculos.length === 1 ? vehiculos[0].placa : prev.placaVehiculo,
      }));
    } else {
      setForm((prev) => ({ ...prev, nombreCliente: nombre }));
    }
  };

  const manoObraValor = manoObra.activo ? parseFloat(manoObra.valor) || 0 : 0;
  const baseTotal = totalLineas + manoObraValor;
  const ivaValor = aplicaIva ? Math.round(baseTotal * 0.19) : 0;
  const totalFinal = baseTotal + ivaValor;

  const toggleTrabajadorMO = (id: number) =>
    setManoObra((prev) => ({
      ...prev,
      trabajadores: prev.trabajadores.includes(id) ? prev.trabajadores.filter((t) => t !== id) : [...prev.trabajadores, id],
    }));

  const openNew = () => {
    setEditingId(null);
    setShowForm(true);
    setForm({ ...emptyForm });
    setLineas([{ id: -Date.now(), cantidad: "1", productoNombre: "", marca: "", precioVenta: "", precioCompra: "0" }]);
    setManoObra({ ...emptyManoObra });
    setAplicaIva(false); setIvaLinea({});
    setFormErrors([]);
  };

  const openEdit = (c: any) => {
    setEditingId(c.id);
    setShowForm(true);
    setEditingHasAbonos((c.abonos?.length ?? 0) > 0);
    setForm({ fechaFactura: c.fechaFactura, nombreCliente: c.nombreCliente, telefonoCliente: c.telefonoCliente || "", placaVehiculo: c.placaVehiculo || "", valorAbonado: String(c.valorAbonado || 0), descripcion: c.descripcion || "" });
    const moLine = c.lineas.find((l: any) => l.productoNombre === MO_NOMBRE);
    const ivaLine = c.lineas.find((l: any) => l.productoNombre === IVA_NOMBRE);
    const prodLines = c.lineas.filter((l: any) => l !== moLine && l !== ivaLine);
    setManoObra(moLine
      ? { activo: true, valor: String(moLine.precioVenta), trabajadores: [], fijados: {}, marca: moLine.productoMarca || "", lineaId: moLine.id, valorAbonado: moLine.valorAbonado }
      : { ...emptyManoObra });
    setAplicaIva(!!ivaLine);
    setIvaLinea(ivaLine ? { id: ivaLine.id, valorAbonado: ivaLine.valorAbonado } : {});
    setLineas(prodLines.length
      ? prodLines.map((l: any) => ({ id: l.id, productoId: l.productoId, productoCodigo: l.productoCodigo, cantidad: String(l.cantidad), productoNombre: l.productoNombre, marca: l.productoMarca || "", precioVenta: String(l.precioVenta), precioCompra: String(l.precioCompra || 0), valorAbonado: l.valorAbonado }))
      : [{ id: -Date.now(), cantidad: "1", productoNombre: "", marca: "", precioVenta: "", precioCompra: "0" }]);
    setFormErrors([]);
  };

  const handleGuardar = () => {
    const errors: string[] = [];
    if (!form.nombreCliente.trim()) errors.push("El nombre es obligatorio");
    if (!form.fechaFactura) errors.push("La fecha es obligatoria");
    if (baseTotal <= 0) errors.push("Agrega al menos un producto con precio");
    if (manoObra.activo && manoObraValor > 0 && manoObra.trabajadores.length === 0 && !manoObra.lineaId)
      errors.push("Selecciona los trabajadores para la mano de obra");
    if (errors.length) { setFormErrors(errors); return; }
    setFormErrors([]);

    // Advertir si alguna línea tiene precioVenta < precioCompra
    const lineasConPerdida = lineas.filter((l) => {
      const pv = parseFloat(l.precioVenta) || 0;
      const pc = parseFloat(l.precioCompra) || 0;
      return l.productoNombre.trim() && pv > 0 && pc > 0 && pv < pc;
    });
    if (lineasConPerdida.length > 0) {
      const detalle = lineasConPerdida
        .map((l) => `• ${l.productoNombre} (venta: $${l.precioVenta}, compra: $${l.precioCompra})`)
        .join("\n");
      const ok = window.confirm(
        `⚠️ Las siguientes líneas tienen precio de venta menor al de compra:\n\n${detalle}\n\n¿Deseas continuar de todas formas?`
      );
      if (!ok) return;
    }

    const nombresTrabajadores = manoObra.trabajadores
      .map((tid) => trabajadores?.find((w) => w.id === tid)?.nombre || `T${tid}`)
      .join(", ");

    type PendingLinea = {
      id?: number; productoId?: number | null; productoCodigo?: string | null;
      cantidad: number; productoNombre: string; productoMarca?: string;
      precioVenta: number; precioCompra: number; total: number; prevAbonado: number;
    };
    const allLineas: PendingLinea[] = lineas
      .filter((l) => l.productoNombre.trim() && parseFloat(l.precioVenta) > 0)
      .map((l) => ({
        id: l.id > 0 ? l.id : undefined,
        productoId: l.productoId, productoCodigo: l.productoCodigo,
        cantidad: parseFloat(l.cantidad) || 0, productoNombre: l.productoNombre,
        productoMarca: l.marca || undefined,
        precioVenta: parseFloat(l.precioVenta) || 0,
        precioCompra: parseFloat(l.precioCompra) || 0,
        total: (parseFloat(l.cantidad) || 0) * (parseFloat(l.precioVenta) || 0),
        prevAbonado: l.valorAbonado || 0,
      }));
    if (manoObra.activo && manoObraValor > 0) {
      allLineas.push({
        id: manoObra.lineaId, cantidad: 1, productoNombre: MO_NOMBRE,
        productoMarca: nombresTrabajadores || manoObra.marca || undefined,
        precioVenta: manoObraValor, precioCompra: 0, total: manoObraValor,
        prevAbonado: manoObra.valorAbonado || 0,
      });
    }
    if (aplicaIva && ivaValor > 0) {
      allLineas.push({
        id: ivaLinea.id, cantidad: 1, productoNombre: IVA_NOMBRE,
        precioVenta: ivaValor, precioCompra: 0, total: ivaValor,
        prevAbonado: ivaLinea.valorAbonado || 0,
      });
    }

    const initialAbono = Math.min(totalFinal, parseFloat(form.valorAbonado) || 0);
    let remaining = initialAbono;
    const payloadLineas = allLineas.map((l) => {
      const applied = editingId ? l.prevAbonado : Math.min(l.total, remaining);
      if (!editingId) remaining -= applied;
      const { total: _t, prevAbonado: _p, ...rest } = l;
      return { ...rest, valorAbonado: applied };
    });

    const data = {
      tipo: TIPO,
      fechaFactura: form.fechaFactura, nombreCliente: form.nombreCliente,
      telefonoCliente: form.telefonoCliente || undefined,
      placaVehiculo: form.placaVehiculo || undefined,
      descripcion: form.descripcion?.trim() || undefined,
      valorCredito: totalFinal,
      valorAbonado: editingId ? parseFloat(form.valorAbonado) || 0 : initialAbono,
      lineas: payloadLineas,
      // El servidor crea/actualiza/revierte la distribución de trabajadores de forma atómica
      manoObra: manoObra.activo && manoObraValor > 0
        ? {
            valor: manoObraValor,
            ...(manoObra.trabajadores.length > 0
                ? {
                trabajadores: calcularDistribucion(manoObraValor, manoObra.trabajadores, manoObra.fijados).map((d) => ({
                  id: d.trabajadorId,
                  nombre: trabajadores?.find((w) => w.id === d.trabajadorId)?.nombre || `Trabajador ${d.trabajadorId}`,
                  valor: d.valor,
                })),
              }
            : { valor: 0 }),
          }
        : { valor: 0 },
    };

    const options = {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/creditos"] });
        queryClient.invalidateQueries({ queryKey: ["/api/manoobra"] });
        queryClient.invalidateQueries({ queryKey: ["/api/trabajadores"] });
        setShowForm(false); setEditingId(null);
        setForm({ ...emptyForm });
        setLineas([{ id: -Date.now(), cantidad: "1", productoNombre: "", marca: "", precioVenta: "", precioCompra: "0" }]);
        setManoObra({ ...emptyManoObra });
        setAplicaIva(false); setIvaLinea({}); setEditingHasAbonos(false);
      },
    };
    if (editingId) {
      actualizarMutation.mutate({ id: editingId, data }, {
        ...options,
        onError: async (error) => {
          if (!esFalloDeRed(error)) {
            toast({ title: "No se pudo guardar", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
            return;
          }
          await encolarOperacion({ tipo: "credito", metodo: "PUT", endpoint: `/creditos/${editingId}`, payload: data });
          toast({ title: "Guardado sin conexión", description: "Este cambio se sincronizará automáticamente cuando vuelva internet." });
          options.onSuccess?.();
        },
      });
    } else {
        const lineasOptimistas = payloadLineas.map((l: any, i: number) => {
          const total = (parseFloat(l.cantidad) || 0) * (parseFloat(l.precioVenta) || 0);
          return { ...l, id: -Date.now() - i, total, valorRestante: total - (l.valorAbonado || 0) };
        });
        agregarFilaOptimista(queryClient, ["/api/creditos", { tipo: TIPO }], {
          ...data,
          lineas: lineasOptimistas,
          valorRestante: data.valorCredito - data.valorAbonado,
        });

        crearMutation.mutate({ data }, {
          ...options,
          onError: async (error) => {
            if (!esFalloDeRed(error)) {
              toast({ title: "No se pudo guardar", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
              return;
            }
            await encolarOperacion({ tipo: "credito", metodo: "POST", endpoint: "/creditos", payload: data });
            toast({ title: "Guardado sin conexión", description: "Este crédito se sincronizará automáticamente cuando vuelva internet." });
            options.onSuccess?.();
          },
        });
      }
  };

  const resetPay = () => { setShowPay(null); setAbono(""); setLineasSeleccionadas([]); setEditingAbonoId(null); setAbonoFormaPago("efectivo"); };

  const handleAbono = (c: any) => {
    const abonoNum = parseFloat(abono);
    if (!abonoNum || abonoNum <= 0) { alert("Valor inválido"); return; }
    if (!lineasSeleccionadas.length) { alert("Selecciona al menos un producto"); return; }
    const maxDisponible = editingAbonoId !== null ? c.valorCredito : c.valorRestante;
    if (abonoNum > maxDisponible + 1) { alert(`El abono no puede superar ${formatCurrency(maxDisponible)}`); return; }
    setPendingAbonoCredit(c);
    setRefTexto("");
    setShowRefModal(true);
  };

  const confirmarAbono = () => {
    const c = pendingAbonoCredit;
    if (!c) return;
    const abonoNum = parseFloat(abono);
    const lineasUsadas = editingAbonoId !== null ? c.lineas : c.lineas.filter((l: any) => l.valorRestante > 0);
    const selected = lineasUsadas.filter((l: any) => lineasSeleccionadas.includes(l.id));
    let rem = abonoNum;
    const lineasAbono = selected.map((l: any) => {
      const tope = editingAbonoId !== null ? (parseFloat(l.cantidad) * parseFloat(l.precioVenta)) : l.valorRestante;
      const v = Math.min(tope, rem);
      rem -= v;
      return { lineaId: l.id, valor: v };
    }).filter((la: any) => la.valor > 0);

    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creditos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
      setShowRefModal(false);
      setPendingAbonoCredit(null);
      resetPay();
    };

    const data: any = { valor: abonoNum, lineas: lineasAbono };
    if (refTexto.trim()) data.customRef = refTexto.trim();
    if (abonoFormaPago) data.formaPago = abonoFormaPago;

    if (editingAbonoId !== null) {
      editarAbonoMutation.mutate({ id: c.id, abonoId: editingAbonoId, data }, { onSuccess });
    } else {
      abonarMutation.mutate(
        { id: c.id, data },
        {
          onSuccess,
          onError: async (error) => {
            if (!esFalloDeRed(error)) {
              toast({ title: "No se pudo guardar", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
              return;
            }
            await encolarOperacion({ tipo: "credito", metodo: "POST", endpoint: `/creditos/${c.id}/abono`, payload: data });
            toast({ title: "Guardado sin conexión", description: "Este abono se sincronizará automáticamente cuando vuelva internet." });
            onSuccess();
          },
        }
      );
    }
  };

  const confirmarYEliminarAbono = () => {
  if (!confirmarCancelarPago) return;
  const { creditoId, abonoId } = confirmarCancelarPago;
  setConfirmarCancelarPago(null);
    eliminarAbonoMutation.mutate({ id: creditoId, abonoId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/creditos"] });
        queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
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
    return creditos.filter((c) => !q || c.nombreCliente.toLowerCase().includes(q) || (soloDigitos(q).length > 0 && soloDigitos(c.telefonoCliente).includes(soloDigitos(q))));
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
                  <input
                    type="text"
                    value={form.nombreCliente}
                    onChange={(e) => handleClienteSelect(e.target.value)}
                    list="clientes-list-nd"
                    placeholder="Nombre del cliente (selecciona o escribe)"
                    className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
                  />
                  <datalist id="clientes-list-nd">
                    {clientes?.map((c) => <option key={c.id} value={c.nombre} />)}
                  </datalist>
                  {clientes && clientes.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">Escribe para buscar clientes guardados o ingresa uno nuevo.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Fecha <span className="text-destructive">*</span></label>
                  <input type="date" value={form.fechaFactura} onChange={(e) => setForm({ ...form, fechaFactura: e.target.value })} className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Teléfono</label>
                  <input type="text" placeholder="(310) 420 1761" value={form.telefonoCliente} onChange={(e) => setForm({ ...form, telefonoCliente: formatTelefono(e.target.value) })} className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Placa Vehículo</label>
                  {(() => {
                    const clienteActivo = clientes?.find((c) => c.nombre === form.nombreCliente);
                    const vehiculosActivo = (clienteActivo as any)?.vehiculos ?? [];
                    return (
                      <>
                        <input type="text" value={form.placaVehiculo}
                          list="vehiculos-nd-list"
                          onChange={(e) => setForm({ ...form, placaVehiculo: e.target.value })}
                          placeholder={vehiculosActivo.length > 0 ? "Selecciona o escribe placa" : "Placa del vehículo (opcional)"}
                          className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
                        <datalist id="vehiculos-nd-list">
                          {vehiculosActivo.map((v: any) => (
                            <option key={v.placa} value={v.placa}>{v.placa}{v.marca ? ` — ${v.marca}` : ""}{v.modelo ? ` ${v.modelo}` : ""}</option>
                          ))}
                        </datalist>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Product lines */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Productos / Servicios</label>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[500px]">
                    <thead><tr className="bg-muted text-muted-foreground border-b border-border text-xs">
                      <th className="px-3 py-2 font-medium">Producto / Servicio</th>
                      <th className="px-3 py-2 font-medium w-24">Cant</th>
                      <th className="px-3 py-2 font-medium w-28">P. Compra</th>
                      <th className="px-3 py-2 font-medium w-28">P. Venta</th>
                      <th className="px-3 py-2 font-medium w-20">Total</th>
                      <th className="px-3 py-2 w-6"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {lineas.map((linea) => (
                        <tr key={linea.id}>
                          <td className="px-3 py-2">
                            <SearchableSelect
                              opciones={(productos || []).map((p): ProductoOpcion => ({
                                id: String(p.id), nombre: p.nombre, codigo: p.codigo,
                                marca: p.marca || undefined, precioVenta: p.precioVentaSinIva,
                                stockActual: p.stockActual, stockMinimo: p.stockMinimo,
                              }))}
                              value={linea.productoId ? String(linea.productoId) : ""}
                              onChange={(id) => handleProductoSelect(linea.id, id)}
                              placeholder="Buscar producto..."
                            />
                            {linea.stockActual !== null && linea.stockActual !== undefined && (
                              linea.stockActual === 0
                                ? <p className="text-red-500 dark:text-red-400 text-[10px] mt-0.5 leading-tight font-medium">⚠ Sin existencias — stock en 0</p>
                                : linea.stockActual <= (linea.stockMinimo ?? 0)
                                  ? <p className="text-yellow-500 dark:text-yellow-400 text-[10px] mt-0.5 leading-tight font-medium">⚠ Pocas existencias ({linea.stockActual} en stock)</p>
                                  : null
                            )}
                          </td>
                          <td className="px-3 py-2"><input type="number" min="0" step="0.25" value={linea.cantidad} onChange={(e) => updateLinea(linea.id, "cantidad", e.target.value)} className="w-full bg-background border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none text-center" /></td>
                          <td className="px-3 py-2"><input type="number" min="0" value={linea.precioCompra} onChange={(e) => updateLinea(linea.id, "precioCompra", e.target.value)} className="w-full bg-background border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" /></td>
                          <td className="px-3 py-2">{(() => { const pv = parseFloat(linea.precioVenta); const pc = parseFloat(linea.precioCompra); const isBelow = linea.precioVenta !== "" && linea.precioCompra !== "" && pc > 0 && pv < pc; return (<div><input type="number" min="0" value={linea.precioVenta} onChange={(e) => updateLinea(linea.id, "precioVenta", e.target.value)} className={`w-full px-2 py-1.5 rounded-lg text-xs focus:ring-1 outline-none border ${isBelow ? "border-red-500 focus:ring-red-500 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400" : "bg-background border-border focus:ring-primary"}`} />{isBelow && <p className="text-red-500 dark:text-red-400 text-[10px] mt-0.5 leading-tight">⚠ Menor al costo</p>}</div>); })()}</td>
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
                <div className="mt-2 flex items-center gap-4">
                  <button type="button" onClick={addLinea} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"><Plus className="w-3.5 h-3.5" />Agregar producto</button>
                  {!manoObra.activo && (
                    <button type="button" onClick={() => setManoObra((p) => ({ ...p, activo: true }))} className="flex items-center gap-1.5 text-xs text-yellow-500 hover:text-yellow-400 transition-colors"><Plus className="w-3.5 h-3.5" />Mano de Obra</button>
                  )}
                </div>
              </div>

              {/* Mano de Obra */}
              {manoObra.activo && (
                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 space-y-3 animate-in fade-in">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium text-yellow-500">🔧 Mano de Obra</p>
                    <button type="button" onClick={() => setManoObra({ ...emptyManoObra })} className="p-1 text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="flex flex-wrap gap-4 items-start">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Valor ($)</label>
                      <input type="number" min="0" placeholder="0" value={manoObra.valor} onChange={(e) => setManoObra((p) => ({ ...p, valor: e.target.value }))}
                        className="w-36 bg-background border border-border px-3 py-2 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Trabajadores</label>
                      {editingId && manoObra.marca && manoObra.trabajadores.length === 0 && (
                        <p className="text-xs text-muted-foreground mb-1">Asignada a: {manoObra.marca}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <ManoObraSelector
                          trabajadores={(trabajadores || []).filter((t) => t.activo)}
                          total={manoObraValor}
                          seleccionados={manoObra.trabajadores}
                          fijados={manoObra.fijados}
                          onChangeSeleccionados={(ids) => setManoObra((p) => ({ ...p, trabajadores: ids }))}
                          onChangeFijados={(fijados) => setManoObra((p) => ({ ...p, fijados }))}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Abono Inicial ($)</label>
                <input type="number" placeholder="0" value={form.valorAbonado} onChange={(e) => setForm({ ...form, valorAbonado: e.target.value })} className="w-40 bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
              </div>

              {/* IVA */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-muted/30 border border-border rounded-xl px-4 py-3">
                <label className={`flex items-center gap-2 text-sm font-medium ${editingId && editingHasAbonos ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    checked={aplicaIva}
                    onChange={(e) => setAplicaIva(e.target.checked)}
                    disabled={!!(editingId && editingHasAbonos)}
                    className="w-4 h-4 accent-primary disabled:cursor-not-allowed"
                  />
                  Aplicar IVA (19%)
                </label>
                {editingId && editingHasAbonos && (
                  <p className="text-xs text-amber-500">IVA no editable — el registro ya tiene pagos registrados</p>
                )}
                {aplicaIva && (
                  <p className="text-xs text-muted-foreground">
                    Subtotal {formatCurrency(baseTotal)} + IVA {formatCurrency(ivaValor)} = <span className="font-bold text-primary">{formatCurrency(totalFinal)}</span>
                  </p>
                )}
              </div>

              {/* Observación general */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Observación general (opcional)</label>
                <textarea
                  rows={2}
                  placeholder="Notas sobre el registro, condiciones especiales, etc."
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm resize-none"
                />
              </div>

              <div className="flex gap-3 justify-end border-t border-border pt-4">
                <button onClick={() => setShowForm(false)} className="px-5 py-2.5 bg-muted text-foreground rounded-xl font-medium text-sm hover:bg-muted/80">Cancelar</button>
                <button onClick={handleGuardar} disabled={crearMutation.isPending || actualizarMutation.isPending} className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 shadow-md">
                  {crearMutation.isPending || actualizarMutation.isPending ? "Guardando..." : `${editingId ? "Actualizar" : "Guardar"} — ${formatCurrency(totalFinal)}`}
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
                          {(c as any)._pendiente ? (
                            <span className="text-[10px] text-amber-400 font-medium whitespace-nowrap" title="Guardado local, esperando sincronizar">⏳ Pendiente</span>
                          ) : (
                            <>
                              <button onClick={() => openEdit(c)} className="p-1 text-muted-foreground hover:text-primary rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => handleEliminar(c.id)} className="p-1 text-muted-foreground hover:text-destructive rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-sm space-y-1 flex-1">
                        {c.telefonoCliente && <p className="text-xs text-muted-foreground">Tel: {formatTelefono(c.telefonoCliente)}</p>}
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
                              {c.abonos.map((a: any) => (
                                <div key={a.id} className="flex justify-between items-center text-xs bg-muted/30 px-2 py-1.5 rounded-lg gap-2">
                                  <span className="text-muted-foreground shrink-0">{new Date(a.fecha + "T12:00:00").toLocaleDateString("es-CO")}</span>
                                  <span className="font-medium text-green-500 flex-1 text-right">+{formatCurrency(a.valorTotal)}</span>
                                  <div className="flex gap-0.5 shrink-0">
                                    <button
                                      title="Editar pago"
                                      onClick={() => { setShowPay(c.id); setEditingAbonoId(a.id); setAbono(String(a.valorTotal)); setLineasSeleccionadas([]); setExpandedAbonos((s) => { const n = new Set(s); n.delete(c.id); return n; }); }}
                                      className="p-1 text-muted-foreground hover:text-primary rounded transition-colors">
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button
                                      title="Eliminar pago"
                                      onClick={() => setConfirmarCancelarPago({ creditoId: c.id, abonoId: a.id, monto: a.valorTotal, fecha: a.fecha })}
                                      disabled={eliminarAbonoMutation.isPending}
                                      className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {showPay === c.id ? (
                        <div className="bg-background rounded-xl p-3 border border-border mt-3 animate-in fade-in">
                          <h4 className="text-xs font-semibold mb-2 text-foreground">
                            {editingAbonoId !== null ? "✏️ Editar Pago" : "Registrar Abono"}
                          </h4>
                          <input type="number"
                            placeholder={editingAbonoId !== null ? "Nuevo valor" : `Máx ${formatCurrency(c.valorRestante)}`}
                            value={abono}
                            onChange={(e) => setAbono(e.target.value)}
                            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm mb-2 focus:ring-1 focus:ring-primary outline-none" />
                          <select value={abonoFormaPago} onChange={(e) => setAbonoFormaPago(e.target.value)}
                            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm mb-2 focus:ring-1 focus:ring-primary outline-none">
                            <option value="efectivo">Efectivo</option>
                            <option value="cuenta_ernesto">Cuenta Ernesto</option>
                            <option value="cuenta_olga">Cuenta Olga</option>
                            <option value="cuenta_juan">Cuenta Juan</option>
                          </select>
                          {c.lineas.length > 0 && (
                            <div className="space-y-1 mb-2">
                              {c.lineas.map((l: any) => {
                                const disponible = editingAbonoId !== null
                                  ? parseFloat(l.cantidad) * parseFloat(l.precioVenta)
                                  : l.valorRestante;
                                return (
                                  <label key={l.id} className="flex items-center justify-between gap-2 text-xs cursor-pointer">
                                    <span className="flex items-center gap-1.5">
                                      <input type="checkbox" checked={lineasSeleccionadas.includes(l.id)} disabled={disponible <= 0}
                                        onChange={() => setLineasSeleccionadas((prev) => prev.includes(l.id) ? prev.filter((id) => id !== l.id) : [...prev, l.id])}
                                        className="w-3.5 h-3.5 accent-primary" />
                                      <span className="truncate">{l.productoNombre}</span>
                                    </span>
                                    <span className={`text-muted-foreground shrink-0 ${disponible <= 0 ? "text-green-500" : ""}`}>
                                      {disponible <= 0 ? "Pagado" : formatCurrency(disponible)}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button onClick={resetPay} className="flex-1 py-1.5 bg-muted text-foreground rounded-lg text-xs font-medium">Cancelar</button>
                            <button onClick={() => handleAbono(c)} disabled={abonarMutation.isPending || editarAbonoMutation.isPending} className="flex-1 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium">
                              {(abonarMutation.isPending || editarAbonoMutation.isPending) ? "..." : editingAbonoId !== null ? "Guardar Cambios" : "Confirmar"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setShowPay(c.id); setAbono(""); setLineasSeleccionadas([]); setEditingAbonoId(null); }}
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

        {confirmarCancelarPago && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4" onClick={() => setConfirmarCancelarPago(null)}>
            <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-foreground">Cancelar este pago</h3>
              <p className="text-sm text-muted-foreground">
                Vas a cancelar el pago de <strong className="text-foreground">{formatCurrency(confirmarCancelarPago.monto)}</strong> registrado el {confirmarCancelarPago.fecha}.
                La línea correspondiente <strong className="text-foreground">volverá a aparecer como pendiente de pago</strong>, y esta venta se eliminará de Ventas Diarias.
              </p>
              <div className="flex gap-2">
                <button onClick={confirmarYEliminarAbono} className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-xl font-medium text-sm">Sí, cancelar pago</button>
                <button onClick={() => setConfirmarCancelarPago(null)} className="px-4 py-2 bg-muted text-foreground rounded-xl font-medium border border-border text-sm">No, mantener</button>
              </div>
            </div>
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
                      {(c as any)._pendiente ? (
                        <span className="text-[10px] text-amber-400 font-medium whitespace-nowrap" title="Guardado local, esperando sincronizar">⏳ Pendiente</span>
                      ) : (
                        <>
                          <button onClick={() => openEdit(c)} className="p-1 text-muted-foreground hover:text-primary rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleEliminar(c.id)} className="p-1 text-muted-foreground hover:text-destructive rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                        </>
                      )}
                    </div>
                  </div>
                  {c.abonos && c.abonos.length > 0 && (
                    <div className="mt-1">
                      <button onClick={() => toggleExpandAbonos(c.id)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors w-full">
                        <Clock className="w-3 h-3" />
                        Historial de pagos ({c.abonos.length})
                        {expandedAbonos.has(c.id) ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                      </button>
                      {expandedAbonos.has(c.id) && (
                        <div className="mt-1.5 space-y-1 animate-in fade-in">
                          {c.abonos.map((a: any) => (
                            <div key={a.id} className="flex justify-between items-center text-xs bg-muted/30 px-2 py-1.5 rounded-lg gap-2">
                              <span className="text-muted-foreground shrink-0">{new Date(a.fecha + "T12:00:00").toLocaleDateString("es-CO")}</span>
                              <span className="font-medium text-green-500 flex-1 text-right">+{formatCurrency(a.valorTotal)}</span>
                              <div className="flex gap-0.5 shrink-0">
                                <button
                                  title="Editar pago"
                                  onClick={() => { setShowPay(c.id); setEditingAbonoId(a.id); setAbono(String(a.valorTotal)); setLineasSeleccionadas([]); setExpandedAbonos((s) => { const n = new Set(s); n.delete(c.id); return n; }); }}
                                  className="p-1 text-muted-foreground hover:text-primary rounded transition-colors">
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  title="Eliminar pago"
                                  onClick={() => setConfirmarCancelarPago({ creditoId: c.id, abonoId: a.id, monto: a.valorTotal, fecha: a.fecha })}
                                  disabled={eliminarAbonoMutation.isPending}
                                  className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {showPay === c.id && (
                    <div className="bg-background rounded-xl p-3 border border-border mt-2 animate-in fade-in">
                      <h4 className="text-xs font-semibold mb-2 text-foreground">
                        {editingAbonoId !== null ? "✏️ Editar Pago" : "Registrar Abono"}
                      </h4>
                      <input type="number"
                        placeholder={editingAbonoId !== null ? "Nuevo valor" : "Valor"}
                        value={abono}
                        onChange={(e) => setAbono(e.target.value)}
                        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm mb-2 focus:ring-1 focus:ring-primary outline-none" />
                      {c.lineas.map((l: any) => {
                        const tope = parseFloat(l.cantidad) * parseFloat(l.precioVenta);
                        return (
                          <label key={l.id} className="flex items-center justify-between gap-2 text-xs cursor-pointer py-1 border-b border-border/30 last:border-0">
                            <span className="flex items-center gap-1.5">
                              <input type="checkbox" checked={lineasSeleccionadas.includes(l.id)}
                                onChange={() => setLineasSeleccionadas((prev) => prev.includes(l.id) ? prev.filter((id) => id !== l.id) : [...prev, l.id])}
                                className="w-3.5 h-3.5 accent-primary" />
                              <span className="truncate">{l.productoNombre}</span>
                            </span>
                            <span className="shrink-0 text-muted-foreground">{formatCurrency(tope)}</span>
                          </label>
                        );
                      })}
                      <div className="flex gap-2 mt-3">
                        <button onClick={resetPay} className="flex-1 py-1.5 bg-muted text-foreground rounded-lg text-xs font-medium">Cancelar</button>
                        <button onClick={() => handleAbono(c)} disabled={editarAbonoMutation.isPending} className="flex-1 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium">
                          {editarAbonoMutation.isPending ? "..." : "Guardar Cambios"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* Modal: No. Remisión antes de confirmar abono */}
      {showRefModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4" onClick={() => setShowRefModal(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-base font-bold text-foreground">No. Remisión / Referencia</h3>
              <p className="text-xs text-muted-foreground mt-1">Opcional — aparecerá en Ventas Diarias como referencia del pago.</p>
            </div>
            <input
              type="text"
              placeholder="Ej: REM-001, Factura 123..."
              value={refTexto}
              onChange={(e) => setRefTexto(e.target.value.slice(0, 35))}
              maxLength={35}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") confirmarAbono(); if (e.key === "Escape") setShowRefModal(false); }}
              className="w-full bg-background border border-border px-4 py-3 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
            />
            <p className="text-[10px] text-muted-foreground text-right">{refTexto.length}/35</p>
            <div className="flex gap-3">
              <button onClick={() => setShowRefModal(false)} className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors">
                Cancelar
              </button>
              <button onClick={confirmarAbono} disabled={abonarMutation.isPending || editarAbonoMutation.isPending} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60 hover:bg-primary/90 transition-colors">
                {(abonarMutation.isPending || editarAbonoMutation.isPending) ? "Guardando..." : "Confirmar Pago"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
