import { useState, useMemo, useRef } from "react";
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
import { Plus, Trash2, X, Pencil, Search, ChevronDown, ChevronUp, Clock, Printer } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const TIPO = "credito";
const MO_NOMBRE = "Mano de Obra";
const IVA_NOMBRE = "IVA (19%)";

interface ManoObraState {
  activo: boolean;
  valor: string;
  trabajadores: number[];
  marca: string; // nombres de trabajadores (preservado al editar)
  lineaId?: number;
  valorAbonado?: number;
}

const emptyManoObra: ManoObraState = { activo: false, valor: "", trabajadores: [], marca: "" };

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
  concepto: "",
  placaVehiculo: "",
  nombreCliente: "",
  telefonoCliente: "",
  valorAbonado: "0",
  descripcion: "",
};

export default function Creditos() {
  const { data: creditos, isLoading } = useGetCreditos({ tipo: TIPO });
  const { data: productos } = useGetInventario();
  const { data: trabajadores } = useGetTrabajadores();
  const { data: clientes } = useGetClientes({});
  const queryClient = useQueryClient();

  const printMenuRef = useRef<HTMLDivElement>(null);
  const [printMenu, setPrintMenu] = useState(false);

  const handlePrintWithOrientation = (orientation: "portrait" | "landscape") => {
    const prev = document.getElementById("__print_page_size");
    if (prev) prev.remove();
    const s = document.createElement("style");
    s.id = "__print_page_size";
    s.textContent = `@page { size: ${orientation}; }`;
    document.head.appendChild(s);
    setPrintMenu(false);
    requestAnimationFrame(() => window.print());
  };

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
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [filtroPlaca, setFiltroPlaca] = useState("");
  const [expandedAbonos, setExpandedAbonos] = useState<Set<number>>(new Set());
  const [manoObra, setManoObra] = useState<ManoObraState>({ ...emptyManoObra });
  const [aplicaIva, setAplicaIva] = useState(false);
  const [ivaLinea, setIvaLinea] = useState<{ id?: number; valorAbonado?: number }>({});
  const [editingHasAbonos, setEditingHasAbonos] = useState(false);
  // null = nuevo abono, number = editando este abonoId
  const [editingAbonoId, setEditingAbonoId] = useState<number | null>(null);

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

  const handleProductoSelect = (lineaId: number, prodNombre: string) => {
    const prod = productos?.find((p) => p.nombre === prodNombre);
    if (prod) {
      setLineas((prev) => prev.map((l) => {
        if (l.id !== lineaId) return l;
        const esLinueva = l.id < 0; // id negativo = línea nueva, no guardada en BD
        return {
          ...l,
          productoId: prod.id,
          productoCodigo: prod.codigo,
          productoNombre: prod.nombre,
          marca: prod.marca || "",
          // Solo auto-llenar precios en líneas nuevas; las guardadas mantienen su precio
          ...(esLinueva ? {
            precioVenta: String(prod.precioVentaSinIva),
            precioCompra: String(prod.precioCompra),
          } : {}),
        };
      }));
    }
  };

  const totalLineas = lineas.reduce((sum, l) => sum + (parseFloat(l.cantidad) || 0) * (parseFloat(l.precioVenta) || 0), 0);
  const handleClienteSelect = (nombre: string) => {
    const cliente = clientes?.find((c) => c.nombre === nombre);
    if (cliente) {
      const vehiculos = (cliente as any).vehiculos ?? [];
      setForm((prev) => ({
        ...prev,
        nombreCliente: cliente.nombre,
        telefonoCliente: formatTelefono(cliente.telefono) || prev.telefonoCliente,
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
    setEditingId(null); setShowForm(true);
    setForm({ ...emptyForm });
    setLineas([{ id: -Date.now(), cantidad: "1", productoNombre: "", marca: "", precioVenta: "", precioCompra: "0" }]);
    setManoObra({ ...emptyManoObra });
    setAplicaIva(false); setIvaLinea({}); setEditingHasAbonos(false);
    setFormErrors([]);
  };

  const openEdit = (c: any) => {
    setEditingId(c.id); setShowForm(true);
    setEditingHasAbonos((c.abonos?.length ?? 0) > 0);
    setForm({ fechaFactura: c.fechaFactura, concepto: c.concepto || "", placaVehiculo: c.placaVehiculo || "", nombreCliente: c.nombreCliente, telefonoCliente: c.telefonoCliente || "", valorAbonado: String(c.valorAbonado || 0), descripcion: c.descripcion || "" });
    const moLine = c.lineas.find((l: any) => l.productoNombre === MO_NOMBRE);
    const ivaLine = c.lineas.find((l: any) => l.productoNombre === IVA_NOMBRE);
    const prodLines = c.lineas.filter((l: any) => l !== moLine && l !== ivaLine);
    setManoObra(moLine
      ? { activo: true, valor: String(moLine.precioVenta), trabajadores: [], marca: moLine.productoMarca || "", lineaId: moLine.id, valorAbonado: moLine.valorAbonado }
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
    if (!form.concepto.trim()) errors.push("El concepto / No. Remisión es obligatorio");
    if (!form.nombreCliente.trim()) errors.push("El nombre del cliente es obligatorio");
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
      tipo: TIPO, concepto: form.concepto.trim(),
      fechaFactura: form.fechaFactura, placaVehiculo: form.placaVehiculo || undefined,
      nombreCliente: form.nombreCliente, telefonoCliente: form.telefonoCliente || undefined,
      descripcion: form.descripcion?.trim() || undefined,
      valorCredito: totalFinal,
      valorAbonado: editingId ? parseFloat(form.valorAbonado) || 0 : initialAbono,
      lineas: payloadLineas,
      // El servidor crea/actualiza/revierte la distribución de trabajadores de forma atómica
      manoObra: manoObra.activo && manoObraValor > 0
        ? {
            valor: manoObraValor,
            ...(manoObra.trabajadores.length > 0
              ? { trabajadores: manoObra.trabajadores.map((tid) => ({ id: tid, nombre: trabajadores?.find((w) => w.id === tid)?.nombre || `Trabajador ${tid}` })) }
              : {}),
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
    if (editingId) actualizarMutation.mutate({ id: editingId, data }, options);
    else crearMutation.mutate({ data }, options);
  };

  const resetPay = () => { setShowPay(null); setAbono(""); setLineasSeleccionadas([]); setEditingAbonoId(null); };

  const handleAbono = (c: any) => {
    const abonoNum = parseFloat(abono);
    if (!abonoNum || abonoNum <= 0) { alert("Valor inválido"); return; }
    if (!lineasSeleccionadas.length) { alert("Selecciona al menos un producto"); return; }
    const maxDisponible = editingAbonoId !== null ? c.valorCredito : c.valorRestante;
    if (abonoNum > maxDisponible + 1) { alert(`El abono no puede superar ${formatCurrency(maxDisponible)}`); return; }
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
      resetPay();
    };

    if (editingAbonoId !== null) {
      editarAbonoMutation.mutate({ id: c.id, abonoId: editingAbonoId, data: { valor: abonoNum, lineas: lineasAbono } }, { onSuccess });
    } else {
      abonarMutation.mutate({ id: c.id, data: { valor: abonoNum, lineas: lineasAbono } }, { onSuccess });
    }
  };

  const handleEliminarAbono = (creditoId: number, abonoId: number) => {
    if (!confirm("¿Eliminar este pago? Se revertirá en Ventas Diarias.")) return;
    eliminarAbonoMutation.mutate({ id: creditoId, abonoId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/creditos"] });
        queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
      },
    });
  };

  const handleEliminar = (id: number) => {
    if (confirm("¿Eliminar este crédito?")) {
      eliminarMutation.mutate({ id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/creditos"] }) });
    }
  };

  const toggleExpandAbonos = (id: number) => {
    setExpandedAbonos((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const q = busqueda.toLowerCase();
  const hayFiltros = !!(busqueda || filtroDesde || filtroHasta || filtroPlaca);
  const allCreditos = useMemo(() => {
    if (!creditos) return [];
    return creditos.filter((c) => {
      if (q && !c.nombreCliente.toLowerCase().includes(q) && !(c.concepto || "").toLowerCase().includes(q) && !(soloDigitos(q) && soloDigitos(c.telefonoCliente).includes(soloDigitos(q)))) return false;
      if (filtroDesde && c.fechaFactura < filtroDesde) return false;
      if (filtroHasta && c.fechaFactura > filtroHasta) return false;
      if (filtroPlaca && !(c.placaVehiculo || "").toLowerCase().includes(filtroPlaca.toLowerCase())) return false;
      return true;
    });
  }, [creditos, q, filtroDesde, filtroHasta, filtroPlaca]);

  const pendientes = allCreditos.filter((c) => c.valorRestante > 0);
  const pagados = allCreditos.filter((c) => c.valorRestante <= 0);
  const totalDeben = pendientes.reduce((s, c) => s + c.valorRestante, 0);

  // For print: pending credits sorted oldest first
  const creditosParaImprimir = useMemo(() => {
    if (!creditos) return [];
    return creditos
      .filter((c) => c.valorRestante > 0)
      .sort((a, b) => a.fechaFactura.localeCompare(b.fechaFactura));
  }, [creditos]);

  const hoyStr = new Date().toLocaleDateString("es-CO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const hoyLabel = hoyStr.charAt(0).toUpperCase() + hoyStr.slice(1);

  // Group pendientes by month
  const porMes = useMemo(() => {
    const map = new Map<string, typeof pendientes>();
    pendientes.forEach((c) => {
      const mes = c.fechaFactura.slice(0, 7);
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

  return (
    <Layout>
      {/* ===== PRINT ZONE — only visible when printing ===== */}
      <div className="print-zone print-only">
        {/* Date header */}
        <div className="print-date-header">
          Créditos Pendientes — {hoyLabel}
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: "7%" }}>Fecha</th>
              <th style={{ width: "9%" }}>Vehículo</th>
              <th style={{ width: "18%" }}>Cliente</th>
              <th style={{ width: "11%" }}>Teléfono</th>
              <th style={{ width: "16%" }}>Factura / Concepto</th>
              <th style={{ width: "10%", textAlign: "right" }}>Total Deuda</th>
              <th style={{ width: "10%", textAlign: "right" }}>Abono</th>
              <th style={{ width: "9%" }}>Fecha Abono</th>
              <th style={{ width: "10%", textAlign: "right" }}>Restante</th>
            </tr>
          </thead>
          <tbody>
            {creditosParaImprimir.map((c) => {
              const ultimoAbono = c.abonos && c.abonos.length > 0 ? c.abonos[0] : null;
              const fechaAbonoStr = ultimoAbono
                ? new Date(ultimoAbono.fecha + "T12:00:00").toLocaleDateString("es-CO")
                : "—";
              return (
                <>
                  {/* Data row — no bottom border so it merges with spacer */}
                  <tr key={`data-${c.id}`} className="print-credito-data">
                    <td>{new Date(c.fechaFactura + "T12:00:00").toLocaleDateString("es-CO")}</td>
                    <td>{c.placaVehiculo || "—"}</td>
                    <td>{c.nombreCliente}</td>
                    <td>{formatTelefono(c.telefonoCliente) || "—"}</td>
                    <td>{c.concepto || "—"}</td>
                    <td style={{ textAlign: "right" }}>$ {c.valorCredito.toLocaleString("es-CO")}</td>
                    <td style={{ textAlign: "right" }}>
                      {c.valorAbonado > 0 ? `$ ${c.valorAbonado.toLocaleString("es-CO")}` : "—"}
                    </td>
                    <td>{fechaAbonoStr}</td>
                    <td style={{ textAlign: "right" }}>$ {c.valorRestante.toLocaleString("es-CO")}</td>
                  </tr>
                  {/* Spacer row — blank space for handwritten annotations */}
                  <tr key={`spacer-${c.id}`} className="print-credito-spacer">
                    <td colSpan={9}></td>
                  </tr>
                </>
              );
            })}
            {creditosParaImprimir.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: "12px", fontStyle: "italic" }}>
                  No hay créditos pendientes
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* ===== END PRINT ZONE ===== */}

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Créditos</h1>
            <p className="text-muted-foreground mt-1 text-sm">Gestión de créditos y cobros pendientes de clientes.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div ref={printMenuRef} className="relative no-print">
              <button
                onClick={() => setPrintMenu((p) => !p)}
                className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/80 transition-all border border-border text-sm"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </button>
              {printMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-2xl overflow-hidden w-52">
                  <button onClick={() => handlePrintWithOrientation("portrait")} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted text-sm text-left transition-colors">
                    <span className="text-base">📄</span> Vertical (retrato)
                  </button>
                  <button onClick={() => handlePrintWithOrientation("landscape")} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted text-sm text-left transition-colors">
                    <span className="text-base">📃</span> Horizontal (paisaje)
                  </button>
                </div>
              )}
            </div>
            <button onClick={openNew} className="no-print flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-lg text-sm">
              <Plus className="w-4 h-4" /> Nuevo Crédito
            </button>
          </div>
        </div>

        {totalDeben > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <p className="text-sm font-medium text-destructive">Total que nos deben</p>
            <p className="text-2xl font-display font-bold text-destructive">{formatCurrency(totalDeben)}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Buscar por cliente, concepto o teléfono..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
            {busqueda && <button onClick={() => setBusqueda("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>}
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Desde</label>
              <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)}
                className="bg-card border border-border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Hasta</label>
              <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)}
                className="bg-card border border-border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div className="relative">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Placa / Vehículo</label>
              <input type="text" placeholder="Placa, buseta, empresa..." value={filtroPlaca} onChange={(e) => setFiltroPlaca(e.target.value)}
                className="bg-card border border-border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none w-52" />
              {filtroPlaca && (
                <button onClick={() => setFiltroPlaca("")} className="absolute right-2.5 top-[2.1rem] text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {hayFiltros && (
              <button
                onClick={() => { setBusqueda(""); setFiltroDesde(""); setFiltroHasta(""); setFiltroPlaca(""); }}
                className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-xl px-3 py-2 bg-card transition-colors"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-4">
            <div className="px-6 py-4 border-b border-border bg-muted/50 flex justify-between items-center">
              <h3 className="text-lg font-display font-bold">{editingId ? "Editar" : "Nuevo"} Crédito</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6 space-y-4">
              {formErrors.length > 0 && <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3">{formErrors.map((e, i) => <p key={i} className="text-destructive text-sm">• {e}</p>)}</div>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Concepto / No. Remisión <span className="text-destructive">*</span></label>
                  <input type="text" placeholder="Ej: R2568 03-AGOST" value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })}
                    className="w-full bg-background border border-primary/30 px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm font-mono" />
                  <p className="text-xs text-muted-foreground mt-1">Se usará como referencia en Ventas Diarias al registrar pagos.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Cliente <span className="text-destructive">*</span></label>
                  <input
                    type="text"
                    value={form.nombreCliente}
                    onChange={(e) => handleClienteSelect(e.target.value)}
                    list="clientes-list-cr"
                    placeholder="Nombre del cliente (selecciona o escribe)"
                    className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
                  />
                  <datalist id="clientes-list-cr">
                    {clientes?.map((c) => <option key={c.id} value={c.nombre} />)}
                  </datalist>
                  {clientes && clientes.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">Escribe para buscar clientes guardados o ingresa uno nuevo.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Fecha <span className="text-destructive">*</span></label>
                  <input type="date" value={form.fechaFactura} onChange={(e) => setForm({ ...form, fechaFactura: e.target.value })}
                    className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Placa / Vehículo</label>
                  {(() => {
                    const clienteActivo = clientes?.find((c) => c.nombre === form.nombreCliente);
                    const vehiculosActivo = (clienteActivo as any)?.vehiculos ?? [];
                    return (
                      <>
                        <input type="text" value={form.placaVehiculo}
                          list="vehiculos-cr-list"
                          onChange={(e) => setForm({ ...form, placaVehiculo: e.target.value })}
                          placeholder={vehiculosActivo.length > 0 ? "Selecciona o escribe placa" : "Ej: ABC123 o MICRO 143 VIACOLTUR"}
                          className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
                        <datalist id="vehiculos-cr-list">
                          {vehiculosActivo.map((v: any) => (
                            <option key={v.placa} value={v.placa}>{v.placa}{v.marca ? ` — ${v.marca}` : ""}{v.modelo ? ` ${v.modelo}` : ""}</option>
                          ))}
                        </datalist>
                      </>
                    );
                  })()}
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Teléfono</label>
                  <input type="text" placeholder="(310) 420 1761" value={form.telefonoCliente} onChange={(e) => setForm({ ...form, telefonoCliente: formatTelefono(e.target.value) })}
                    className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
                </div>
              </div>

              {/* Product lines */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Productos</label>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead><tr className="bg-muted text-muted-foreground border-b border-border text-xs">
                      <th className="px-3 py-2 font-medium">Producto</th>
                      <th className="px-3 py-2 font-medium w-24">Cant</th>
                      <th className="px-3 py-2 font-medium w-28">P. Compra</th>
                      <th className="px-3 py-2 font-medium w-28">P. Venta</th>
                      <th className="px-3 py-2 font-medium w-24">Total</th>
                      <th className="px-3 py-2 w-6"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {lineas.map((linea) => (
                        <tr key={linea.id}>
                          <td className="px-3 py-2">
                            <input type="text" placeholder="Nombre del producto..."
                              value={linea.productoNombre}
                              onChange={(e) => { updateLinea(linea.id, "productoNombre", e.target.value); handleProductoSelect(linea.id, e.target.value); }}
                              list={`prod-list-cr-${linea.id}`}
                              className="w-full bg-background border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" />
                            <datalist id={`prod-list-cr-${linea.id}`}>
                              {productos?.map((p) => <option key={p.id} value={p.nombre} />)}
                            </datalist>
                          </td>
                          <td className="px-3 py-2"><input type="number" min="0" step="0.25" value={linea.cantidad} onChange={(e) => updateLinea(linea.id, "cantidad", e.target.value)} className="w-full bg-background border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none text-center" /></td>
                          <td className="px-3 py-2">
                            <input type="number" min="0" value={linea.precioCompra} onChange={(e) => updateLinea(linea.id, "precioCompra", e.target.value)} className="w-full bg-background border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" placeholder="P.Compra" />
                          </td>
                          <td className="px-3 py-2"><input type="number" min="0" value={linea.precioVenta} onChange={(e) => updateLinea(linea.id, "precioVenta", e.target.value)} className="w-full bg-background border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" /></td>
                          <td className="px-3 py-2 text-xs font-bold text-primary">{formatCurrency((parseFloat(linea.cantidad) || 0) * (parseFloat(linea.precioVenta) || 0))}</td>
                          <td className="px-3 py-2"><button type="button" onClick={() => removeLinea(linea.id)} disabled={lineas.length === 1} className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"><X className="w-3.5 h-3.5" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-border bg-muted/30">
                      <tr><td colSpan={4} className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Total crédito</td>
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
                        {trabajadores?.filter((t) => t.activo).map((t) => (
                          <label key={t.id} className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${manoObra.trabajadores.includes(t.id) ? "bg-yellow-500/15 border-yellow-500/40 text-yellow-500" : "bg-background border-border text-muted-foreground"}`}>
                            <input type="checkbox" className="w-3.5 h-3.5 accent-yellow-500" checked={manoObra.trabajadores.includes(t.id)} onChange={() => toggleTrabajadorMO(t.id)} />
                            {t.nombre}
                          </label>
                        ))}
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
                  <p className="text-xs text-amber-500">IVA no editable — el crédito ya tiene pagos registrados</p>
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
                  placeholder="Notas sobre el crédito, condiciones especiales, etc."
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
          <div className="text-center py-8 text-muted-foreground text-sm">Cargando créditos...</div>
        ) : pendientes.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-2xl border border-border">
            <p className="text-muted-foreground text-sm">{hayFiltros ? "Sin resultados para los filtros aplicados." : "No hay créditos pendientes. ✓"}</p>
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
                      <div className="flex justify-between items-start mb-2">
                        <div className="min-w-0">
                          <h3 className="font-bold text-foreground truncate">{c.nombreCliente}</h3>
                          {c.concepto && <p className="text-xs font-mono text-primary">{c.concepto}</p>}
                          <p className="text-xs text-muted-foreground">{new Date(c.fechaFactura + "T12:00:00").toLocaleDateString("es-CO")}{c.placaVehiculo ? ` · ${c.placaVehiculo}` : ""}</p>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0 ml-2">
                          <button onClick={() => openEdit(c)} className="p-1 text-muted-foreground hover:text-primary rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleEliminar(c.id)} className="p-1 text-muted-foreground hover:text-destructive rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>

                      <div className="text-sm space-y-1 flex-1">
                        <div className="flex justify-between border-t border-border/50 pt-1.5 mt-1">
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

                      {/* Product lines */}
                      {c.lineas.length > 0 && (
                        <div className="mt-3 bg-background rounded-lg border border-border/50 p-2.5 space-y-1">
                          {c.lineas.map((l: any) => (
                            <div key={l.id} className="flex items-center justify-between text-xs gap-2">
                              <span className="truncate text-foreground">{l.cantidad} × {l.productoNombre}</span>
                              <span className={`shrink-0 ${l.valorRestante <= 0 ? "text-green-500" : "text-muted-foreground"}`}>
                                {l.valorRestante <= 0 ? "✓ Pagado" : formatCurrency(l.valorRestante)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

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
                                      onClick={() => handleEliminarAbono(c.id, a.id)}
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

                      {/* Abono section */}
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
                          <p className="text-[10px] text-muted-foreground mb-2">Selecciona el/los producto(s) a pagar:</p>
                          {c.lineas.length > 0 ? c.lineas.map((l: any) => {
                            const disponible = editingAbonoId !== null
                              ? parseFloat(l.cantidad) * parseFloat(l.precioVenta)
                              : l.valorRestante;
                            return (
                              <label key={l.id} className="flex items-center justify-between gap-2 text-xs cursor-pointer py-1 border-b border-border/30 last:border-0">
                                <span className="flex items-center gap-1.5">
                                  <input type="checkbox" checked={lineasSeleccionadas.includes(l.id)} disabled={disponible <= 0}
                                    onChange={() => setLineasSeleccionadas((prev) => prev.includes(l.id) ? prev.filter((id) => id !== l.id) : [...prev, l.id])}
                                    className="w-3.5 h-3.5 accent-primary" />
                                  <span className="truncate">{l.cantidad} × {l.productoNombre}</span>
                                </span>
                                <span className={`shrink-0 text-xs ${disponible <= 0 ? "text-green-500" : "text-muted-foreground"}`}>
                                  {disponible <= 0 ? "Pagado" : formatCurrency(disponible)}
                                </span>
                              </label>
                            );
                          }) : <p className="text-xs text-muted-foreground">Edita el crédito para agregar productos.</p>}
                          <div className="flex gap-2 mt-3">
                            <button onClick={resetPay} className="flex-1 py-1.5 bg-muted text-foreground rounded-lg text-xs font-medium">Cancelar</button>
                            <button onClick={() => handleAbono(c)} disabled={abonarMutation.isPending || editarAbonoMutation.isPending} className="flex-1 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium">
                              {(abonarMutation.isPending || editarAbonoMutation.isPending) ? "..." : editingAbonoId !== null ? "Guardar Cambios" : "Confirmar Pago"}
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

        {/* Pagados */}
        {pagados.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
              Pagados al 100% ({pagados.length})
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {pagados.map((c) => (
                <div key={c.id} className="bg-card border border-green-500/30 rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div><p className="font-medium text-foreground">{c.nombreCliente}</p>
                      {c.concepto && <p className="text-xs font-mono text-muted-foreground">{c.concepto}</p>}
                      <p className="text-xs text-muted-foreground">{new Date(c.fechaFactura + "T12:00:00").toLocaleDateString("es-CO")} · {formatCurrency(c.valorCredito)}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0 items-center">
                      <span className="text-xs text-green-500 font-bold bg-green-500/10 px-2 py-0.5 rounded-full">Pagado ✓</span>
                      <button onClick={() => openEdit(c)} className="p-1 text-muted-foreground hover:text-primary rounded"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleEliminar(c.id)} className="p-1 text-muted-foreground hover:text-destructive rounded"><Trash2 className="w-3.5 h-3.5" /></button>
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
                                  onClick={() => handleEliminarAbono(c.id, a.id)}
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
                  {/* Panel de abono/editar también disponible en pagados */}
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
                      <p className="text-[10px] text-muted-foreground mb-2">Selecciona los productos:</p>
                      {c.lineas.map((l: any) => {
                        const tope = parseFloat(l.cantidad) * parseFloat(l.precioVenta);
                        return (
                          <label key={l.id} className="flex items-center justify-between gap-2 text-xs cursor-pointer py-1 border-b border-border/30 last:border-0">
                            <span className="flex items-center gap-1.5">
                              <input type="checkbox" checked={lineasSeleccionadas.includes(l.id)}
                                onChange={() => setLineasSeleccionadas((prev) => prev.includes(l.id) ? prev.filter((id) => id !== l.id) : [...prev, l.id])}
                                className="w-3.5 h-3.5 accent-primary" />
                              <span className="truncate">{l.cantidad} × {l.productoNombre}</span>
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
    </Layout>
  );
}
