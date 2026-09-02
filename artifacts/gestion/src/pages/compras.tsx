import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/Layout";
import {
  useGetCompras,
  useActualizarCompra,
  useCrearCompra,
  useEliminarCompra,
  useGetInventario,
} from "@workspace/api-client-react";
import { fechaHoyColombia, formatCurrency } from "@/lib/utils";
import { PackageCheck, Truck, Plus, X, Printer, ChevronDown, ChevronUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { encolarOperacion } from "@/lib/offline-db";
import { toast } from "@/hooks/use-toast";
import { esFalloDeRed } from "@/lib/offline-db";
import {Pencil} from "lucide-react";

interface LlegadaForm {
  cantidad: string;
  nuevoPrecioCompra: string;
  nuevoPrecioVentaSinIva: string;
  tieneIva: boolean;
  proveedor: string;
  fechaLlegada: string;
}

interface PrecioConfirmModal {
  compra: any;
  form: LlegadaForm;
  precioCompraAnterior: number;
  precioVentaAnterior: number;
  precioCompraNuevo: number;
  precioVentaNuevo: number;
}

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");

function agruparPorAnioMes(llegadas: any[]) {
  const porAnio = new Map<string, Map<string, any[]>>();
  for (const c of llegadas) {
    if (!c.fechaLlegada) continue;
    const [anio, mes] = c.fechaLlegada.split("-");
    if (!porAnio.has(anio)) porAnio.set(anio, new Map());
    const meses = porAnio.get(anio)!;
    if (!meses.has(mes)) meses.set(mes, []);
    meses.get(mes)!.push(c);
  }
  return [...porAnio.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([anio, meses]) => ({
      anio,
      meses: [...meses.entries()].sort((a, b) => b[0].localeCompare(a[0])),
    }));
}

const NOMBRES_MES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

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
  const [loteFecha, setLoteFecha] = useState(fechaHoyColombia());

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

  const [llegadaOpen, setLlegadaOpen] = useState<number | null>(null);
  const [llegadaForm, setLlegadaForm] = useState<LlegadaForm>({
    cantidad: "",
    nuevoPrecioCompra: "",
    nuevoPrecioVentaSinIva: "",
    tieneIva: false,
    proveedor: "",
    fechaLlegada: fechaHoyColombia(),
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState<number | null>(null);
  const [precioConfirm, setPrecioConfirm] = useState<PrecioConfirmModal | null>(null);
  const [seleccionadas, setSeleccionadas] = useState<number[]>([]);
  const [loteOpen, setLoteOpen] = useState(false);
  const [loteProveedor, setLoteProveedor] = useState("");
  const [loteFecha, setLoteFecha] = useState(fechaHoyColombia());
  const [loteDatos, setLoteDatos] = useState<Record<number, { cantidadRecibida: string; nuevoPrecioCompra: string; nuevoPrecioVentaSinIva: string }>>({});
  const [procesandoLote, setProcesandoLote] = useState(false);
  const [editandoLlegadaId, setEditandoLlegadaId] = useState<number | null>(null);
  const [editCantidad, setEditCantidad] = useState("");
  const [editPrecioCompra, setEditPrecioCompra] = useState("");

  const openLlegada = (compra: any) => {
    setLlegadaOpen(compra.id);
    const prod = productos?.find((p) => p.id === compra.productoId);
    setLlegadaForm({
      cantidad: "",
      nuevoPrecioCompra: prod ? String(prod.precioCompra) : "",
      nuevoPrecioVentaSinIva: prod ? String(prod.precioVentaSinIva) : "",
      tieneIva: prod ? prod.tieneIva : false,
      proveedor: "",
      fechaLlegada: fechaHoyColombia(),
    });
  };

  const ejecutarLlegada = (compra: any, form: LlegadaForm, actualizarPrecioInventario: boolean) => {
    const payloadLlegada = {
      fechaLlegada: form.fechaLlegada,
      estado: "llegado" as const,
      cantidadRecibida: parseFloat(form.cantidad),
      nuevoPrecioCompra: form.nuevoPrecioCompra ? parseFloat(form.nuevoPrecioCompra) : undefined,
      nuevoPrecioVentaSinIva: form.nuevoPrecioVentaSinIva ? parseFloat(form.nuevoPrecioVentaSinIva) : undefined,
      tieneIva: form.tieneIva,
      proveedor: form.proveedor || undefined,
      actualizarPrecioInventario,
    };

    actualizarMutation.mutate(
      { id: compra.id, data: payloadLlegada },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/compras"] });
          queryClient.invalidateQueries({ queryKey: ["/api/inventario"] });
          queryClient.invalidateQueries({ queryKey: ["/api/historial-precios"] });
          setLlegadaOpen(null);
          setPrecioConfirm(null);
        },
        onError: async (error) => {
          if (!esFalloDeRed(error)) {
            toast({ title: "No se pudo guardar", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
            return;
          }
          await encolarOperacion({ tipo: "compra", metodo: "PUT", endpoint: `/compras/${compra.id}`, payload: payloadLlegada });
          toast({ title: "Guardado sin conexión", description: "Esta llegada de mercancía se sincronizará automáticamente cuando vuelva internet." });
          setLlegadaOpen(null);
          setPrecioConfirm(null);
        },
      }
    );
  };

  const handleLlegada = (compra: any) => {
    if (!llegadaForm.cantidad || parseFloat(llegadaForm.cantidad) <= 0) {
      alert("Ingresa la cantidad recibida");
      return;
    }

    // Check if prices were modified
    const prod = productos?.find((p) => p.id === compra.productoId);
    const pcNuevo = llegadaForm.nuevoPrecioCompra ? parseFloat(llegadaForm.nuevoPrecioCompra) : null;
    const pvNuevo = llegadaForm.nuevoPrecioVentaSinIva ? parseFloat(llegadaForm.nuevoPrecioVentaSinIva) : null;
    const pcActual = prod ? prod.precioCompra : 0;
    const pvSinIvaActual = prod ? prod.precioVentaSinIva : 0;
    const pvConIvaActual = prod ? prod.precioVentaConIva : 0;

    const cambioPrecioCompra = pcNuevo !== null && Math.abs(pcNuevo - pcActual) > 0.01;
    const cambioPrecioVenta = pvNuevo !== null && Math.abs(pvNuevo - pvSinIvaActual) > 0.01;

    if (cambioPrecioCompra || cambioPrecioVenta) {
      // Show confirmation popup
      setPrecioConfirm({
        compra,
        form: { ...llegadaForm },
        precioCompraAnterior: pcActual,
        precioVentaAnterior: pvConIvaActual,
        precioCompraNuevo: pcNuevo ?? pcActual,
        precioVentaNuevo: pvNuevo
          ? (llegadaForm.tieneIva ? Math.ceil(pvNuevo * 1.19 / 1000) * 1000 : pvNuevo)
          : pvConIvaActual,
      });
    } else {
      // No price change — just record (always writes to historial)
      ejecutarLlegada(compra, llegadaForm, true);
    }
  };

  const handleAddManual = () => {
    if (!productoSeleccionado) {
      alert("Selecciona un producto");
      return;
    }
    const payloadCompra = { productoId: productoSeleccionado };
    crearMutation.mutate(
      { data: payloadCompra },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/compras"] });
          setShowAddForm(false);
          setProductoSeleccionado(null);
        },
        onError: async (error) => {
          if (!esFalloDeRed(error)) {
            toast({ title: "No se pudo guardar", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
            return;
          }
          await encolarOperacion({ tipo: "compra", metodo: "POST", endpoint: "/compras", payload: payloadCompra });
          toast({ title: "Guardado sin conexión", description: "Esta orden de compra se sincronizará automáticamente cuando vuelva internet." });
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
  const [aniosAbiertos, setAniosAbiertos] = useState<Set<string>>(new Set());
  const [mesesAbiertos, setMesesAbiertos] = useState<Set<string>>(new Set());
  const [mesImprimir, setMesImprimir] = useState<string>("");

useEffect(() => {
  if (mesImprimir || !llegados.length) return;
  const claves = llegados.filter((c: any) => c.fechaLlegada).map((c: any) => c.fechaLlegada.slice(0, 7));
  if (claves.length) setMesImprimir([...claves].sort().reverse()[0]);
}, [llegados, mesImprimir]);

  return (
    <Layout>
      {/* Price change confirmation modal */}
      {loteOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4" onClick={() => setLoteOpen(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <h2 className="text-lg font-bold text-foreground">Registrar llegada en lote</h2>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Proveedor (aplica a todos)</label>
                <input value={loteProveedor} onChange={(e) => setLoteProveedor(e.target.value)}
                  className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Fecha de llegada (aplica a todos)</label>
                <input type="date" value={loteFecha} onChange={(e) => setLoteFecha(e.target.value)} className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
              </div>
              <div className="space-y-3">
                {seleccionadas.map((id) => {
                  const compra = pendientes.find((c: any) => c.id === id);
                  const datos = loteDatos[id] || { cantidadRecibida: "", nuevoPrecioCompra: "", nuevoPrecioVentaSinIva: "" };
                  return (
                    <div key={id} className="bg-background border border-border rounded-xl p-3">
                      <p className="text-sm font-medium text-foreground mb-2">{compra?.productoNombre}</p>
                      <div className="grid grid-cols-3 gap-2">
                        <input type="number" placeholder="Cantidad" value={datos.cantidadRecibida}
                          onChange={(e) => setLoteDatos((prev) => ({ ...prev, [id]: { ...prev[id], cantidadRecibida: e.target.value } }))}
                          className="bg-card border border-border px-2 py-1.5 rounded-lg text-xs" />
                        <input type="number" placeholder="Precio compra" value={datos.nuevoPrecioCompra}
                          onChange={(e) => setLoteDatos((prev) => ({ ...prev, [id]: { ...prev[id], nuevoPrecioCompra: e.target.value } }))}
                          className="bg-card border border-border px-2 py-1.5 rounded-lg text-xs" />
                        <input type="number" placeholder="Precio venta (sin IVA)" value={datos.nuevoPrecioVentaSinIva}
                          onChange={(e) => setLoteDatos((prev) => ({ ...prev, [id]: { ...prev[id], nuevoPrecioVentaSinIva: e.target.value } }))}
                          className="bg-card border border-border px-2 py-1.5 rounded-lg text-xs" />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <button
                  disabled={procesandoLote || !loteProveedor.trim()}
                  onClick={async () => {
                    setProcesandoLote(true);
                    try {
                      const res = await fetch(`${API}/compras/lote-llegada`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          proveedor: loteProveedor,
                          fechaLlegada: loteFecha,
                          items: seleccionadas.map((id) => ({ id, ...loteDatos[id] })),
                        }),
                      });
                      if (res.ok) {
                        queryClient.invalidateQueries({ queryKey: ["/api/compras"] });
                        queryClient.invalidateQueries({ queryKey: ["/api/inventario"] });
                        setLoteOpen(false);
                        setSeleccionadas([]);
                        setLoteProveedor("");
                      }
                    } finally {
                      setProcesandoLote(false);
                    }
                  }}
                  className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 disabled:opacity-40 text-sm"
                >
                  {procesandoLote ? "Procesando..." : "Confirmar llegada de todos"}
                </button>
                <button onClick={() => setLoteOpen(false)} className="px-4 py-2.5 bg-muted text-foreground rounded-xl font-medium border border-border text-sm">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {precioConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95">
            <h3 className="text-lg font-display font-bold text-foreground mb-1">Precios modificados</h3>
            <p className="text-sm text-muted-foreground mb-4">Detectamos cambios en los precios. ¿Quieres actualizar el inventario con los nuevos precios?</p>
            <div className="bg-background border border-border rounded-xl p-4 mb-5 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">P. Compra anterior:</span>
                <span className="line-through text-muted-foreground">{formatCurrency(precioConfirm.precioCompraAnterior)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-muted-foreground">P. Compra nuevo:</span>
                <span className={precioConfirm.precioCompraNuevo > precioConfirm.precioCompraAnterior ? "text-destructive" : "text-green-500"}>
                  {formatCurrency(precioConfirm.precioCompraNuevo)}
                  <span className="text-xs ml-1">
                    ({precioConfirm.precioCompraNuevo > precioConfirm.precioCompraAnterior ? "+" : ""}
                    {(((precioConfirm.precioCompraNuevo - precioConfirm.precioCompraAnterior) / (precioConfirm.precioCompraAnterior || 1)) * 100).toFixed(1)}%)
                  </span>
                </span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between">
                <span className="text-muted-foreground">P. Venta anterior:</span>
                <span className="line-through text-muted-foreground">{formatCurrency(precioConfirm.precioVentaAnterior)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-muted-foreground">P. Venta nuevo (c/IVA):</span>
                <span className={precioConfirm.precioVentaNuevo > precioConfirm.precioVentaAnterior ? "text-destructive" : "text-green-500"}>
                  {formatCurrency(precioConfirm.precioVentaNuevo)}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-4">En ambos casos se guardará el registro de precios en el Historial de Precios.</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => ejecutarLlegada(precioConfirm.compra, precioConfirm.form, true)}
                disabled={actualizarMutation.isPending}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90"
              >
                ✓ Sí, actualizar inventario con nuevos precios
              </button>
              <button
                onClick={() => ejecutarLlegada(precioConfirm.compra, precioConfirm.form, false)}
                disabled={actualizarMutation.isPending}
                className="w-full py-2.5 bg-muted text-foreground rounded-xl font-medium text-sm hover:bg-muted/80"
              >
                Solo registrar llegada (mantener precios actuales)
              </button>
              <button
                onClick={() => setPrecioConfirm(null)}
                className="w-full py-2 text-muted-foreground text-sm hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div className="no-print flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Módulo de Compras</h1>
            <p className="text-muted-foreground mt-1 text-sm">Pedidos pendientes y registro histórico de llegadas.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
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
            {seleccionadas.length > 0 && (
              <button
                onClick={() => {
                  setLoteDatos(Object.fromEntries(seleccionadas.map((id) => [id, { cantidadRecibida: "1", nuevoPrecioCompra: "", nuevoPrecioVentaSinIva: "" }])));
                  setLoteOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/80 transition-all border border-border text-sm"
              >
                Registrar llegada en lote ({seleccionadas.length})
              </button>
            )}
            <button
              onClick={() => { setShowAddForm(!showAddForm); setProductoSeleccionado(null); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-md text-sm"
            >
              <Plus className="w-4 h-4" />
              Agregar Producto
            </button>
          </div>
        </div>


        {editandoLlegadaId !== null && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4" onClick={() => setEditandoLlegadaId(null)}>
            <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-foreground">Corregir llegada</h3>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Cantidad correcta</label>
                <input type="number" value={editCantidad} onChange={(e) => setEditCantidad(e.target.value)} className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Precio de compra correcto</label>
                <input type="number" value={editPrecioCompra} onChange={(e) => setEditPrecioCompra(e.target.value)} className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm" />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={async () => {
                    await fetch(`${API}/compras/${editandoLlegadaId}/corregir`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ cantidadRecibida: editCantidad, precioCompraRegistrado: editPrecioCompra }),
                    });
                    queryClient.invalidateQueries({ queryKey: ["/api/compras"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/inventario"] });
                    setEditandoLlegadaId(null);
                  }}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium text-sm"
                >
                  Guardar corrección
                </button>
                <button onClick={() => setEditandoLlegadaId(null)} className="px-4 py-2 bg-muted text-foreground rounded-xl font-medium border border-border text-sm">Cancelar</button>
              </div>
            </div>
          </div>
        )}
        {/* Autocomplete add form */}
        {showAddForm && (
          <div className="no-print bg-card border border-border rounded-2xl p-5 animate-in fade-in slide-in-from-top-3 shadow-xl">
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
              <div className="no-print">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-destructive inline-block"></span>
                  Pedidos Pendientes ({pendientes.length})
                </h3>
                <div className="space-y-3">
                  {pendientes.map((compra) => (
                    <div key={compra.id} className="bg-card rounded-xl border border-destructive/40 shadow-md overflow-hidden">
                      <div className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={seleccionadas.includes(compra.id)}
                            onChange={(e) => setSeleccionadas((prev) => e.target.checked ? [...prev, compra.id] : prev.filter((id) => id !== compra.id))}
                            className="accent-primary w-4 h-4 flex-shrink-0"
                          />
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
                              <input type="number" min="0" step="0.25" placeholder="0" value={llegadaForm.cantidad} onChange={(e) => setLlegadaForm({ ...llegadaForm, cantidad: e.target.value })} className="w-full bg-card border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
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
                              <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Fecha de llegada</label>
                                <input type="date" value={llegadaForm.fechaLlegada} onChange={(e) => setLlegadaForm({ ...llegadaForm, fechaLlegada: e.target.value })} className="w-full bg-card border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                              </div>
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
              <div className="print-zone">
                <h3 className="no-print text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                  Historial de Llegadas ({llegados.length})
                </h3>
                <div className="print-only print-date-header">
                  <strong>Historial de Llegadas — Compras</strong>
                  <span style={{ float: "right" }}>{new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" })}</span>
                </div>
                <div className="no-print flex items-center gap-2 mb-3">
                  <label className="text-xs font-medium text-muted-foreground">Mes a imprimir:</label>
                  <select value={mesImprimir} onChange={(e) => setMesImprimir(e.target.value)} className="bg-background border border-border px-3 py-1.5 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none">
                    {[...new Set(llegados.filter((c: any) => c.fechaLlegada).map((c: any) => c.fechaLlegada.slice(0, 7)))]
                      .sort().reverse()
                      .map((clave) => (
                        <option key={clave} value={clave}>{NOMBRES_MES[parseInt(clave.split("-")[1])]} {clave.split("-")[0]}</option>
                      ))}
                  </select>
                </div>
                {agruparPorAnioMes(llegados).map(({ anio, meses }) => {
                  const totalAnio = meses.reduce((s, [, items]) => s + items.reduce((s2, c) => s2 + (c.cantidadRecibida ?? 0) * (c.precioCompraRegistrado ?? 0), 0), 0);
                  const anioAbierto = aniosAbiertos.has(anio);

                  return (
                    <div key={anio} className="mb-3">
                      <button
                        onClick={() => setAniosAbiertos((prev) => { const s = new Set(prev); s.has(anio) ? s.delete(anio) : s.add(anio); return s; })}
                        className="no-print w-full flex items-center justify-between bg-muted px-4 py-2.5 rounded-xl border border-border"
                      >
                        <span className="font-bold text-foreground flex items-center gap-2">
                          {anioAbierto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />} {anio}
                        </span>
                        <span className="text-sm font-bold text-primary">Total invertido en el año: {formatCurrency(totalAnio)}</span>
                      </button>

                      {(anioAbierto || true) && (
                        <div className={`pl-3 mt-2 space-y-2 ${anioAbierto ? "" : "hidden"} ${mesImprimir.startsWith(anio + "-") ? "print:block" : "print:hidden"}`}>
                          {meses.map(([mes, items]) => {
                            const claveMes = `${anio}-${mes}`;
                            const mesAbierto = mesesAbiertos.has(claveMes);
                            const totalMes = items.reduce((s, c) => s + (c.cantidadRecibida ?? 0) * (c.precioCompraRegistrado ?? 0), 0);

                            return (
                              <div key={claveMes} className={`${anioAbierto ? "" : "hidden"} ${claveMes === mesImprimir ? "print:block" : "print:hidden"}`}>
                                <button
                                  onClick={() => setMesesAbiertos((prev) => { const s = new Set(prev); s.has(claveMes) ? s.delete(claveMes) : s.add(claveMes); return s; })}
                                  className="no-print w-full flex items-center justify-between bg-background px-4 py-2 rounded-lg border border-border"
                                >
                                  <span className="font-medium text-foreground text-sm flex items-center gap-2">
                                    {mesAbierto ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} {NOMBRES_MES[parseInt(mes)]}
                                  </span>
                                  <span className="text-sm font-bold text-foreground">{formatCurrency(totalMes)}</span>
                                </button>

                                <div className="print-only print-date-header">
                                  <strong>{NOMBRES_MES[parseInt(mes)]} {anio}</strong>
                                </div>

                                <div className={`overflow-x-auto mt-2 bg-card border border-border rounded-2xl ${mesAbierto ? "" : "hidden"} ${claveMes === mesImprimir ? "print:block" : "print:hidden"}`}>
                                  <table className="w-full text-sm text-left">
                                    <thead>
                                      <tr className="bg-muted text-muted-foreground border-b border-border">
                                        <th className="px-4 py-3 font-medium whitespace-nowrap">Fecha Llegada</th>
                                        <th className="px-4 py-3 font-medium whitespace-nowrap">Producto</th>
                                        <th className="px-4 py-3 font-medium whitespace-nowrap hidden sm:table-cell print:table-cell">Marca</th>
                                        <th className="px-4 py-3 font-medium whitespace-nowrap">Cant.</th>
                                        <th className="px-4 py-3 font-medium whitespace-nowrap hidden md:table-cell print:table-cell">P. Compra</th>
                                        <th className="px-4 py-3 font-medium whitespace-nowrap hidden md:table-cell print:table-cell">P. Venta</th>
                                        <th className="px-4 py-3 font-medium whitespace-nowrap">Total Compra</th>
                                        <th className="px-4 py-3 font-medium whitespace-nowrap hidden lg:table-cell print:table-cell">Proveedor</th>
                                        <th className="px-4 py-3 font-medium no-print"></th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                      {items.map((compra) => {
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
                                            <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell print:table-cell">{compra.productoMarca || "—"}</td>
                                            <td className="px-4 py-3 font-medium">{cantRec > 0 ? cantRec : "—"}</td>
                                            <td className="px-4 py-3 text-muted-foreground hidden md:table-cell print:table-cell">{precioC > 0 ? formatCurrency(precioC) : "—"}</td>
                                            <td className="px-4 py-3 text-muted-foreground hidden md:table-cell print:table-cell">{precioV > 0 ? formatCurrency(precioV) : "—"}</td>
                                            <td className="px-4 py-3 font-bold text-primary">{totalCompra > 0 ? formatCurrency(totalCompra) : "—"}</td>
                                            <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell print:table-cell">{compra.proveedor || "—"}</td>
                                            <td className="px-4 py-3 no-print">
                                              <div className="flex gap-1 justify-end">
                                                <button
                                                  onClick={() => { setEditandoLlegadaId(compra.id); setEditCantidad(String(cantRec)); setEditPrecioCompra(String(precioC)); }}
                                                  className="p-1 text-muted-foreground hover:text-primary rounded transition-colors"
                                                >
                                                  <Pencil className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleEliminar(compra.id)} className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors">
                                                  <X className="w-4 h-4" />
                                                </button>
                                              </div>
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
                  );
                })}
              </div>
            )}
            </div>
          )}
        </div>
      </Layout>
    );
}
