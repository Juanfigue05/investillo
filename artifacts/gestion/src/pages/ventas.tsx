import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Layout } from "@/components/Layout";
import {
  useGetVentas,
  useCrearVenta,
  useGetInventario,
  useEliminarVenta,
  useActualizarVenta,
  useGetTrabajadores,
  useCrearManoObra,
  useGetHistorial,
  useGuardarDiaHistorial,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Printer, Save, Trash2, ChevronDown, X, Pencil, Check, BookMarked } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const SPECIAL_MANOOBRA = "__manoobra__";
const SPECIAL_ABONO = "__abono__";

interface ProductoOpcion {
  id: string;
  nombre: string;
  marca?: string;
  precioCompra?: number;
  precioVenta?: number;
  special?: "manoobra" | "abono";
}

interface EditValues {
  referencia: string;
  productoNombre: string;
  productoMarca: string;
  cantidad: string;
  precioCompraUnidad: string;
  precioVentaUnidad: string;
  precioVentaTotal: string;
  beneficio: string;
}

function SearchableSelect({
  opciones,
  value,
  onChange,
  placeholder,
}: {
  opciones: ProductoOpcion[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);

  const selected = opciones.find((o) => o.id === value);

  const filtered = busqueda.trim()
    ? opciones.filter(
        (o) =>
          o.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
          (o.marca || "").toLowerCase().includes(busqueda.toLowerCase())
      )
    : opciones;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setBusqueda("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on scroll so the fixed dropdown doesn't drift
  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setBusqueda(""); };
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setBusqueda("");
  };

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      setDropdownRect(triggerRef.current.getBoundingClientRect());
    }
    setOpen((prev) => !prev);
    if (!open) setBusqueda("");
  };

  return (
    <div ref={containerRef} className="relative w-full min-w-[160px]">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none text-left"
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected ? selected.nombre : placeholder || "Seleccionar..."}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-2" />
      </button>

      {open && dropdownRect && createPortal(
        <div
          style={{
            position: "fixed",
            top: dropdownRect.bottom + 4,
            left: dropdownRect.left,
            width: dropdownRect.width,
            zIndex: 9999,
          }}
          className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        >
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              type="text"
              placeholder="Buscar producto..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full bg-background border border-border px-3 py-1.5 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-center py-4 text-muted-foreground text-sm">Sin resultados</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => handleSelect(o.id)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2 ${
                    o.special === "manoobra" ? "text-yellow-400 font-medium" :
                    o.special === "abono" ? "text-blue-400 font-medium" : "text-foreground"
                  }`}
                >
                  {o.nombre}
                  {o.marca && <span className="text-muted-foreground text-xs">— {o.marca}</span>}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default function VentasDiarias() {
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const { data: ventas, isLoading } = useGetVentas({ fecha });
  const { data: productos } = useGetInventario();
  const { data: trabajadores } = useGetTrabajadores();
  const { data: historial } = useGetHistorial();

  const queryClient = useQueryClient();
  const crearMutation = useCrearVenta();
  const eliminarMutation = useEliminarVenta();
  const actualizarMutation = useActualizarVenta();
  const crearManoObraMutation = useCrearManoObra();
  const guardarDiaMutation = useGuardarDiaHistorial();

  const [newRow, setNewRow] = useState({
    referencia: "",
    productoSeleccionado: "" as string,
    productoNombreManual: "",
    marca: "",
    cantidad: "1",
    precioManoObra: 0,
    precioVenta: 0,
    precioCompra: 0,
    valorAbono: 0,
    trabajadoresSeleccionados: [] as number[],
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<EditValues>({
    referencia: "",
    productoNombre: "",
    productoMarca: "",
    cantidad: "1",
    precioCompraUnidad: "0",
    precioVentaUnidad: "0",
    precioVentaTotal: "0",
    beneficio: "0",
  });

  const diaYaGuardado = historial?.some((d) => d.fecha === fecha);

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

  const opcionesProducto: ProductoOpcion[] = [
    { id: SPECIAL_MANOOBRA, nombre: "🔧 Mano de Obra", special: "manoobra" },
    { id: SPECIAL_ABONO, nombre: "💳 Abono A", special: "abono" },
    ...(productos || []).map((p) => ({
      id: String(p.id),
      nombre: p.nombre,
      marca: p.marca || undefined,
      precioCompra: p.precioCompra,
      precioVenta: p.precioVentaConIva,
    })),
  ];

  const modoActual =
    newRow.productoSeleccionado === SPECIAL_MANOOBRA ? "manoobra" :
    newRow.productoSeleccionado === SPECIAL_ABONO ? "abono" : "normal";

  const handleProductoSelect = (id: string) => {
    if (id === SPECIAL_MANOOBRA) {
      setNewRow((prev) => ({ ...prev, productoSeleccionado: id, marca: "", cantidad: "1", precioCompra: 0, precioVenta: 0, precioManoObra: 0, valorAbono: 0, trabajadoresSeleccionados: [] }));
    } else if (id === SPECIAL_ABONO) {
      setNewRow((prev) => ({ ...prev, productoSeleccionado: id, marca: "", cantidad: "1", precioCompra: 0, precioVenta: 0, precioManoObra: 0, valorAbono: 0, productoNombreManual: "" }));
    } else {
      const prod = productos?.find((p) => String(p.id) === id);
      if (prod) {
        setNewRow((prev) => ({ ...prev, productoSeleccionado: id, marca: prod.marca || "", precioCompra: prod.precioCompra, precioVenta: prod.precioVentaConIva, trabajadoresSeleccionados: [] }));
      }
    }
  };

  const toggleTrabajador = (id: number) => {
    setNewRow((prev) => ({
      ...prev,
      trabajadoresSeleccionados: prev.trabajadoresSeleccionados.includes(id)
        ? prev.trabajadoresSeleccionados.filter((t) => t !== id)
        : [...prev.trabajadoresSeleccionados, id],
    }));
  };

  const openEdit = (venta: NonNullable<typeof ventas>[number]) => {
    setEditingId(venta.id);
    setEditValues({
      referencia: venta.referencia,
      productoNombre: venta.productoNombre || "",
      productoMarca: venta.productoMarca || "",
      cantidad: String(venta.cantidad),
      precioCompraUnidad: String(venta.precioCompraUnidad),
      precioVentaUnidad: String(venta.precioVentaUnidad),
      precioVentaTotal: String(venta.precioVentaTotal),
      beneficio: String(venta.beneficio),
    });
  };

  const handleSaveEdit = (venta: NonNullable<typeof ventas>[number]) => {
    const cant = parseFloat(editValues.cantidad) || 0;
    const pvU = parseFloat(editValues.precioVentaUnidad) || 0;
    const pcU = parseFloat(editValues.precioCompraUnidad) || 0;
    const total = pvU * cant;
    const beneficio = venta.tipoLinea === "venta" ? (pvU - pcU) * cant : parseFloat(editValues.beneficio) || 0;
    actualizarMutation.mutate(
      {
        id: venta.id,
        data: {
          fecha: venta.fecha,
          referencia: editValues.referencia,
          tipoLinea: venta.tipoLinea,
          productoId: venta.productoId || undefined,
          productoNombre: editValues.productoNombre || undefined,
          productoCodigo: venta.productoCodigo || undefined,
          productoMarca: editValues.productoMarca || undefined,
          cantidad: cant,
          precioCompraUnidad: pcU,
          precioVentaUnidad: pvU,
          precioVentaTotal: total,
          beneficio,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
          setEditingId(null);
        },
      }
    );
  };

  const handleAddRow = () => {
    if (!newRow.referencia) { alert("Escribe una referencia / No. Remisión"); return; }

    if (modoActual === "manoobra") {
      if (!newRow.precioManoObra || newRow.trabajadoresSeleccionados.length === 0) {
        alert("Llena el precio de mano de obra y selecciona los trabajadores");
        return;
      }
      const valor = newRow.precioManoObra;
      const n = newRow.trabajadoresSeleccionados.length;
      const base = Math.floor(valor / n);
      const resto = valor - base * n;
      const distribuciones = newRow.trabajadoresSeleccionados.map((tid, i) => {
        const t = trabajadores?.find((w) => w.id === tid);
        return { trabajadorId: tid, trabajadorNombre: t?.nombre || `Trabajador ${tid}`, valor: i === n - 1 ? base + resto : base, descuentoSeguro: 0, descuentoOtros: 0 };
      });
      crearManoObraMutation.mutate(
        { data: { fecha, descripcion: newRow.referencia, valorTotal: valor, distribuciones } },
        {
          onSuccess: () => {
            crearMutation.mutate(
              {
                data: {
                  fecha, referencia: newRow.referencia, tipoLinea: "manoobra",
                  productoNombre: "Mano de Obra",
                  productoMarca: newRow.trabajadoresSeleccionados.map((tid) => trabajadores?.find((w) => w.id === tid)?.nombre || `T${tid}`).join(", "),
                  cantidad: 1, precioCompraUnidad: 0, precioVentaUnidad: valor, precioVentaTotal: valor, beneficio: valor,
                  descripcion: distribuciones.map((d) => `${d.trabajadorNombre}: ${formatCurrency(d.valor)}`).join(" | "),
                },
              },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/manoobra"] });
                  setNewRow((prev) => ({ ...prev, productoSeleccionado: "", marca: "", cantidad: "1", precioManoObra: 0, trabajadoresSeleccionados: [] }));
                },
              }
            );
          },
        }
      );
      return;
    }

    if (modoActual === "abono") {
      if (!newRow.productoNombreManual || !newRow.valorAbono) { alert("Completa el nombre y el valor del abono"); return; }
      crearMutation.mutate(
        {
          data: {
            fecha, referencia: newRow.referencia, tipoLinea: "credito",
            productoNombre: `Abono A: ${newRow.productoNombreManual}`,
            cantidad: 1, precioCompraUnidad: 0, precioVentaUnidad: newRow.valorAbono,
            precioVentaTotal: newRow.valorAbono, beneficio: 0, descripcion: "Abono a crédito",
          },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
            setNewRow((prev) => ({ ...prev, productoSeleccionado: "", productoNombreManual: "", valorAbono: 0 }));
          },
        }
      );
      return;
    }

    const prod = productos?.find((p) => String(p.id) === newRow.productoSeleccionado);
    const nombreProducto = prod?.nombre || "";
    if (!nombreProducto) { alert("Selecciona un producto del inventario"); return; }
    const cantNum = parseFloat(newRow.cantidad.replace(",", "."));
    if (isNaN(cantNum) || cantNum <= 0) { alert("Cantidad inválida. Usa coma para decimales, ej: 1,5"); return; }
    const beneficio = (newRow.precioVenta - newRow.precioCompra) * cantNum;
    const total = newRow.precioVenta * cantNum;
    crearMutation.mutate(
      {
        data: {
          fecha, referencia: newRow.referencia, tipoLinea: "venta",
          productoId: prod ? prod.id : undefined, productoNombre: nombreProducto,
          productoCodigo: prod?.codigo, productoMarca: newRow.marca || prod?.marca || undefined,
          cantidad: cantNum, precioCompraUnidad: newRow.precioCompra,
          precioVentaUnidad: newRow.precioVenta, precioVentaTotal: total, beneficio,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
          setNewRow((prev) => ({ ...prev, productoSeleccionado: "", marca: "", cantidad: "1", precioCompra: 0, precioVenta: 0 }));
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    if (confirm("¿Eliminar esta fila?")) {
      eliminarMutation.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
            queryClient.invalidateQueries({ queryKey: ["/api/inventario"] });
          },
        }
      );
    }
  };

  const handleGuardarDia = () => {
    if (diaYaGuardado) { alert("Este día ya está guardado en el historial."); return; }
    if (!ventas || ventas.length === 0) { alert("No hay ventas para guardar en este día."); return; }
    guardarDiaMutation.mutate(
      { data: { fecha } },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/historial"] }),
        onError: () => queryClient.invalidateQueries({ queryKey: ["/api/historial"] }),
      }
    );
  };

  // Computed totals
  const ventasRows = ventas?.filter((v) => v.tipoLinea === "venta") || [];

  const totalPCompra = ventasRows.reduce((acc, v) => acc + v.precioCompraUnidad, 0);
  const totalPVenta = ventasRows.reduce((acc, v) => acc + v.precioVentaUnidad, 0);
  const totalVentaTotal = ventasRows.reduce((acc, v) => acc + v.precioVentaTotal, 0);
  const totalBeneficio = ventasRows.reduce((acc, v) => acc + v.beneficio, 0);
  const cantNum = parseFloat(newRow.cantidad.replace(",", ".")) || 0;
  const previewTotal = modoActual === "normal" ? newRow.precioVenta * cantNum : modoActual === "manoobra" ? newRow.precioManoObra : 0;
  const previewBeneficio = modoActual === "normal" ? (newRow.precioVenta - newRow.precioCompra) * cantNum : 0;

  const fechaFormateada = new Date(fecha + "T12:00:00").toLocaleDateString("es-CO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="no-print flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Ventas Diarias</h1>
            <p className="text-muted-foreground mt-1 text-sm">Registra las ventas del día directamente en la tabla.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="bg-card border border-border text-foreground px-3 py-2 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
            />
            <button
              onClick={handleGuardarDia}
              disabled={guardarDiaMutation.isPending}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all border text-sm ${
                diaYaGuardado
                  ? "bg-green-500/10 border-green-500/30 text-green-500 cursor-default"
                  : "bg-primary text-primary-foreground border-primary hover:bg-primary/90 shadow-md shadow-primary/20"
              }`}
            >
              <BookMarked className="w-4 h-4" />
              {diaYaGuardado ? "Guardado" : "Guardar en Historial"}
            </button>
            <div className="relative">
              <button
                onClick={() => setPrintMenu((p) => !p)}
                className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/80 transition-all border border-border text-sm"
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
          </div>
        </div>

        {/* Table */}
        <div className="print-zone bg-card border border-border rounded-2xl overflow-hidden shadow-xl shadow-black/10">
          <div className="print-only print-date-header">
            Ventas Diarias — {fechaFormateada}
          </div>

          <div className="overflow-auto max-h-[62vh]">
            <table className="w-full text-left border-collapse text-xs lg:text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted text-muted-foreground border-b border-border">
                  <th className="px-2 py-3 font-medium no-print w-10"></th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">No. Remisión / Ref</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">Producto</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">Marca / Info</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">Cant</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">P. Compra</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">P. Venta</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">Total Venta</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">Beneficio/Ganancia</th>
                  <th className="px-3 py-3 font-medium no-print w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {/* New Row Input */}
                <tr className={`no-print bg-background/40 ${modoActual === "manoobra" ? "row-manoobra" : modoActual === "abono" ? "row-credito" : ""}`}>
                  <td className="p-2 no-print">
                    <button
                      onClick={handleAddRow}
                      disabled={crearMutation.isPending || crearManoObraMutation.isPending}
                      className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shadow"
                      title="Guardar fila"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                  </td>
                  <td className="p-2">
                    <input
                      type="text"
                      placeholder="R 1234 24-ENE"
                      value={newRow.referencia}
                      onChange={(e) => setNewRow({ ...newRow, referencia: e.target.value })}
                      className="w-full bg-background border border-border px-3 py-2 rounded-lg focus:ring-1 focus:ring-primary outline-none text-sm"
                    />
                  </td>
                  <td className="p-2 min-w-[180px]">
                    <SearchableSelect
                      opciones={opcionesProducto}
                      value={newRow.productoSeleccionado}
                      onChange={handleProductoSelect}
                      placeholder="Seleccionar producto..."
                    />
                    {modoActual === "abono" && (
                      <input
                        type="text"
                        placeholder="Nombre cliente..."
                        value={newRow.productoNombreManual}
                        onChange={(e) => setNewRow({ ...newRow, productoNombreManual: e.target.value })}
                        className="w-full mt-1 bg-background border border-blue-500/50 px-3 py-1.5 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                      />
                    )}
                  </td>
                  <td className="p-2">
                    {modoActual === "normal" && (
                      <input type="text" value={newRow.marca} onChange={(e) => setNewRow({ ...newRow, marca: e.target.value })} className="w-20 bg-background border border-border px-2 py-2 rounded-lg focus:ring-1 focus:ring-primary outline-none text-sm" placeholder="Marca" />
                    )}
                    {modoActual === "manoobra" && (
                      <div className="flex flex-wrap gap-1 max-w-[160px]">
                        {trabajadores?.map((t) => (
                          <button key={t.id} type="button" onClick={() => toggleTrabajador(t.id)}
                            className={`px-2 py-1 rounded-lg border text-xs font-medium transition-all ${newRow.trabajadoresSeleccionados.includes(t.id) ? "bg-yellow-500/20 border-yellow-500 text-yellow-400" : "bg-background border-border text-muted-foreground hover:border-yellow-500/50"}`}
                          >
                            {t.nombre}
                          </button>
                        ))}
                      </div>
                    )}
                    {modoActual === "abono" && <span className="text-xs text-blue-400 italic">Abono</span>}
                  </td>
                  <td className="p-2">
                    {modoActual === "normal" && (
                      <input type="text" placeholder="1" value={newRow.cantidad} onChange={(e) => setNewRow({ ...newRow, cantidad: e.target.value })} className="w-14 bg-background border border-border px-2 py-2 rounded-lg focus:ring-1 focus:ring-primary outline-none text-sm" />
                    )}
                    {modoActual === "manoobra" && <span className="text-xs text-muted-foreground">{newRow.trabajadoresSeleccionados.length} trab.</span>}
                    {modoActual === "abono" && <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="p-2">
                    {modoActual === "normal" && (
                      <input type="number" value={newRow.precioCompra || ""} onChange={(e) => setNewRow({ ...newRow, precioCompra: parseFloat(e.target.value) || 0 })} className="w-24 bg-background border border-border px-2 py-2 rounded-lg focus:ring-1 focus:ring-primary outline-none text-sm" placeholder="P.Compra" />
                    )}
                    {modoActual === "manoobra" && (
                      <input type="number" value={newRow.precioManoObra || ""} onChange={(e) => setNewRow({ ...newRow, precioManoObra: parseFloat(e.target.value) || 0 })} className="w-24 bg-background border border-yellow-500/50 px-2 py-2 rounded-lg focus:ring-1 focus:ring-yellow-500 outline-none text-sm" placeholder="Precio M.O." />
                    )}
                    {modoActual === "abono" && (
                      <input type="number" value={newRow.valorAbono || ""} onChange={(e) => setNewRow({ ...newRow, valorAbono: parseFloat(e.target.value) || 0 })} className="w-24 bg-background border border-blue-500/50 px-2 py-2 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="Valor" />
                    )}
                  </td>
                  <td className="p-2">
                    {modoActual === "normal" ? (
                      <input type="number" value={newRow.precioVenta || ""} onChange={(e) => setNewRow({ ...newRow, precioVenta: parseFloat(e.target.value) || 0 })} className="w-24 bg-background border border-border px-2 py-2 rounded-lg focus:ring-1 focus:ring-primary outline-none text-sm" placeholder="P.Venta" />
                    ) : (
                      <span className="text-xs text-muted-foreground px-2">—</span>
                    )}
                  </td>
                  <td className="p-2 font-medium text-primary whitespace-nowrap">{formatCurrency(previewTotal)}</td>
                  <td className="p-2 font-medium text-green-500 whitespace-nowrap">
                    {modoActual === "normal" ? formatCurrency(previewBeneficio) : "—"}
                  </td>
                  <td className="p-2 no-print"></td>
                </tr>

                {/* Registered rows */}
                {isLoading ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">Cargando ventas...</td></tr>
                ) : ventas?.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-6 text-center text-muted-foreground text-sm">Sin registros para esta fecha.</td></tr>
                ) : (
                  ventas?.map((venta) => {
                    const rowCls = venta.tipoLinea === "manoobra" ? "row-manoobra" : venta.tipoLinea === "credito" ? "row-credito" : "row-venta";
                    const isEditing = editingId === venta.id;

                    if (isEditing) {
                      const editPvU = parseFloat(editValues.precioVentaUnidad) || 0;
                      const editPcU = parseFloat(editValues.precioCompraUnidad) || 0;
                      const editCant = parseFloat(editValues.cantidad) || 0;
                      const editTotal = editPvU * editCant;
                      const editBen = venta.tipoLinea === "venta" ? (editPvU - editPcU) * editCant : 0;
                      return (
                        <tr key={venta.id} className={`${rowCls} ring-2 ring-inset ring-primary/40`}>
                          <td className="p-2 no-print"></td>
                          <td className="p-2"><input value={editValues.referencia} onChange={(e) => setEditValues((v) => ({ ...v, referencia: e.target.value }))} className="w-full bg-background border border-primary/50 px-2 py-1.5 rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary" /></td>
                          <td className="p-2"><input value={editValues.productoNombre} onChange={(e) => setEditValues((v) => ({ ...v, productoNombre: e.target.value }))} className="w-full bg-background border border-primary/50 px-2 py-1.5 rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary" /></td>
                          <td className="p-2"><input value={editValues.productoMarca} onChange={(e) => setEditValues((v) => ({ ...v, productoMarca: e.target.value }))} className="w-20 bg-background border border-primary/50 px-2 py-1.5 rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary" /></td>
                          <td className="p-2"><input type="number" value={editValues.cantidad} onChange={(e) => setEditValues((v) => ({ ...v, cantidad: e.target.value }))} className="w-14 bg-background border border-primary/50 px-2 py-1.5 rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary" /></td>
                          <td className="p-2"><input type="number" value={editValues.precioCompraUnidad} onChange={(e) => setEditValues((v) => ({ ...v, precioCompraUnidad: e.target.value }))} className="w-24 bg-background border border-primary/50 px-2 py-1.5 rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary" /></td>
                          <td className="p-2"><input type="number" value={editValues.precioVentaUnidad} onChange={(e) => setEditValues((v) => ({ ...v, precioVentaUnidad: e.target.value }))} className="w-24 bg-background border border-primary/50 px-2 py-1.5 rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary" /></td>
                          <td className="p-2 font-bold text-primary whitespace-nowrap">{formatCurrency(editTotal)}</td>
                          <td className="p-2 font-medium text-green-500 whitespace-nowrap">{venta.tipoLinea === "venta" ? formatCurrency(editBen) : "—"}</td>
                          <td className="p-2 no-print">
                            <div className="flex gap-1">
                              <button onClick={() => handleSaveEdit(venta)} disabled={actualizarMutation.isPending} className="p-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors border border-primary/30"><Check className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setEditingId(null)} className="p-1.5 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors border border-border"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={venta.id} className={`${rowCls} group hover:brightness-110 transition-all`}>
                        <td className="px-3 py-3 no-print w-10"></td>
                        <td className="px-3 py-3 font-mono text-xs">{venta.referencia}</td>
                        <td className="px-3 py-3 font-medium">{venta.productoNombre}</td>
                        <td className="px-3 py-3 text-muted-foreground text-xs">{venta.productoMarca || "—"}</td>
                        <td className="px-3 py-3">{String(venta.cantidad).replace(".", ",")}</td>
                        <td className="px-3 py-3 text-muted-foreground">{formatCurrency(venta.precioCompraUnidad)}</td>
                        <td className="px-3 py-3 text-muted-foreground">{formatCurrency(venta.precioVentaUnidad)}</td>
                        <td className="px-3 py-3 font-bold text-primary">{formatCurrency(venta.precioVentaTotal)}</td>
                        <td className="px-3 py-3 font-medium text-green-500">{venta.tipoLinea === "venta" ? formatCurrency(venta.beneficio) : "—"}</td>
                        <td className="px-3 py-3 no-print">
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => openEdit(venta)} className="p-1.5 text-muted-foreground hover:text-primary bg-background/50 rounded-lg transition-all border border-border">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(venta.id)} className="p-1.5 text-muted-foreground hover:text-destructive bg-background/50 rounded-lg transition-all border border-border">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* ── Totals footer ── */}
              <tfoot className="border-t-2 border-border">
                {/* Row 1: Sales totals */}
                {(ventasRows.length > 0) && (
                  <tr className="bg-card">
                    <td className="no-print"></td>
                    <td colSpan={4} className="px-3 py-2.5 text-right font-medium text-muted-foreground uppercase text-xs tracking-wider">
                      Total Ventas del Día
                    </td>
                    <td className="px-3 py-2.5 font-bold text-foreground whitespace-nowrap text-xs">{formatCurrency(totalPCompra)}</td>
                    <td className="px-3 py-2.5 font-bold text-foreground whitespace-nowrap text-xs">{formatCurrency(totalPVenta)}</td>
                    <td className="px-3 py-2.5 font-display font-bold text-lg text-primary whitespace-nowrap">{formatCurrency(totalVentaTotal)}</td>
                    <td className="px-3 py-2.5 font-bold text-green-500 whitespace-nowrap">{formatCurrency(totalBeneficio)}</td>
                    <td className="no-print"></td>
                  </tr>
                )}

              </tfoot>
            </table>
          </div>
        </div>

        <div className="no-print flex flex-wrap gap-4 text-xs font-medium uppercase tracking-wider text-muted-foreground p-4 bg-card rounded-xl border border-border">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-background border border-border"></div> Venta Normal</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500/30 border border-yellow-500/50"></div> Mano de Obra</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500/30 border border-blue-500/50"></div> Crédito / Abono</div>
        </div>
      </div>
    </Layout>
  );
}
