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
  useGetHistorial,
  useGuardarDiaHistorial,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Printer, Save, BookMarked } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ManoObraSelector, calcularDistribucion } from "@/components/ManoObraSelector";
import { encolarOperacion } from "@/lib/offline-db";
import { toast } from "@/hooks/use-toast";
import { esFalloDeRed } from "@/lib/offline-db";
import { fechaHoyColombia, fechaColombia } from "@/lib/utils";
import { SearchableSelect, type ProductoOpcion } from "@/components/SearchableSelect";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { FilaVentaSortable } from "@/components/FilaVentaSortable";

const SPECIAL_MANOOBRA = "__manoobra__";
const SPECIAL_SOLDADURA = "__soldadura__";
const SPECIAL_ABONO = "__abono__";

const SERVICIOS_SOLDADURA: Record<string, string> = {
  soldadura: "Soldadura",
  chispeada: "Chispeada",
  pulida: "Pulida",
};

function agregarFilaOptimista(queryClient: any, fecha: string, fila: any) {
  const idTemporal = -Date.now() - Math.random();
  queryClient.setQueryData(["/api/ventas", { fecha }], (old: any[] = []) => [
    ...(old || []),
    { id: idTemporal, ...fila, _pendiente: true },
  ]);
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
  formaPago: string;
}

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");

export default function VentasDiarias() {
  const newRowRef = useRef<HTMLTableRowElement>(null);
  const [fecha, setFecha] = useState(fechaHoyColombia());
  const { data: ventas, isLoading } = useGetVentas({ fecha });
  const { data: productos } = useGetInventario();
  const { data: trabajadores } = useGetTrabajadores();
  const { data: historial } = useGetHistorial();

  const queryClient = useQueryClient();
  const crearMutation = useCrearVenta();
  const eliminarMutation = useEliminarVenta();
  const actualizarMutation = useActualizarVenta();
  const guardarDiaMutation = useGuardarDiaHistorial();

  const [ordenLocal, setOrdenLocal] = useState<any[] | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const ventasOrdenadas = ordenLocal ?? ventas ?? [];

  useEffect(() => {
    setOrdenLocal(null);
  }, [fecha]);

  useEffect(() => {
    if (isLoading) return;
    const frame = requestAnimationFrame(() => {
      newRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [fecha, isLoading]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = ventasOrdenadas.findIndex((v: any) => v.id === active.id);
    const newIndex = ventasOrdenadas.findIndex((v: any) => v.id === over.id);
    const nuevoOrden = arrayMove(ventasOrdenadas, oldIndex, newIndex);

    setOrdenLocal(nuevoOrden); // se ve el cambio al instante, sin esperar al servidor

    await fetch(`${API}/ventas/reordenar`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: nuevoOrden.map((v: any) => v.id) }),
    });
    queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
  };

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
    valoresFijados: {} as Record<number, number>,
    formaPago: "efectivo",
  });

  const [stockAlerta, setStockAlerta] = useState<{ stock: number; minimo: number } | null>(null);

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
    formaPago: "efectivo",
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
    { id: `${SPECIAL_SOLDADURA}:soldadura`, nombre: "⚡ Soldadura", special: "manoobra" },
    { id: `${SPECIAL_SOLDADURA}:chispeada`, nombre: "⚡ Chispeada", special: "manoobra" },
    { id: `${SPECIAL_SOLDADURA}:pulida`, nombre: "⚡ Pulida", special: "manoobra" },
    { id: SPECIAL_ABONO, nombre: "💳 Abono A", special: "abono" },
    ...(productos || []).map((p) => ({
      id: String(p.id),
      nombre: p.nombre,
      marca: p.marca || undefined,
      precioCompra: p.precioCompra,
      precioVenta: p.precioVentaSinIva,
    })),
  ];

  const modoActual =
    newRow.productoSeleccionado === SPECIAL_MANOOBRA ? "manoobra" :
    newRow.productoSeleccionado.startsWith(SPECIAL_SOLDADURA) ? "soldadura" :
    newRow.productoSeleccionado === SPECIAL_ABONO ? "abono" : "normal";

  const servicioActual = newRow.productoSeleccionado.startsWith(`${SPECIAL_SOLDADURA}:`)
    ? SERVICIOS_SOLDADURA[newRow.productoSeleccionado.split(":")[1]]
    : "Mano de Obra";

  const handleProductoSelect = (id: string) => {
    if (id === SPECIAL_MANOOBRA || id.startsWith(`${SPECIAL_SOLDADURA}:`)) {
      setNewRow((prev) => ({ ...prev, productoSeleccionado: id, marca: "X", cantidad: "1", precioCompra: 0, precioVenta: 0, precioManoObra: 0, valorAbono: 0, trabajadoresSeleccionados: [] }));
      setStockAlerta(null);
    } else if (id === SPECIAL_ABONO) {
      setNewRow((prev) => ({ ...prev, productoSeleccionado: id, marca: "X", cantidad: "1", precioCompra: 0, precioVenta: 0, precioManoObra: 0, valorAbono: 0, productoNombreManual: "" }));
      setStockAlerta(null);
    } else {
      const prod = productos?.find((p) => String(p.id) === id);
      if (prod) {
        setNewRow((prev) => ({ ...prev, productoSeleccionado: id, marca: prod.marca || "X", precioCompra: prod.precioCompra, precioVenta: prod.precioVentaSinIva, trabajadoresSeleccionados: [] }));
        const stock = parseFloat(String(prod.stockActual ?? 0)) || 0;
        const minimo = parseFloat(String(prod.stockMinimo ?? 0)) || 0;
        setStockAlerta({ stock, minimo });
      } else {
        setStockAlerta(null);
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
      formaPago: (venta as { formaPago?: string }).formaPago || "efectivo",
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

    if (modoActual === "manoobra" || modoActual === "soldadura") {
      if (!newRow.precioManoObra || newRow.trabajadoresSeleccionados.length === 0) {
        alert("Llena el valor del servicio y selecciona los trabajadores");
        return;
      }
      const valor = newRow.precioManoObra;
      const dist = calcularDistribucion(valor, newRow.trabajadoresSeleccionados, newRow.valoresFijados);
      const distribuciones = dist.map((d) => {
        const t = trabajadores?.find((w) => w.id === d.trabajadorId);
        return { trabajadorId: d.trabajadorId, trabajadorNombre: t?.nombre || `Trabajador ${d.trabajadorId}`, valor: d.valor };
      });

      const payloadManoObra = {
        fecha, referencia: newRow.referencia, valorTotal: valor, distribuciones,
        productoNombre: servicioActual,
        formaPago: newRow.formaPago,
        productoMarca: distribuciones.map((d) => `${d.trabajadorNombre.toUpperCase()}(${Math.round(d.valor / 1000)})`).join(""),
        descripcion: distribuciones.map((d) => `${d.trabajadorNombre}: ${formatCurrency(d.valor)}`).join(" | "),
      };

      const limpiarFilaManoObra = () =>
        setNewRow((prev) => ({ ...prev, productoSeleccionado: "", marca: "", cantidad: "1", precioManoObra: 0, trabajadoresSeleccionados: [], valoresFijados: {} }));

      agregarFilaOptimista(queryClient, fecha, {
        referencia: newRow.referencia, tipoLinea: "manoobra",
        productoNombre: servicioActual, productoMarca: payloadManoObra.productoMarca,
        cantidad: 1, precioCompraUnidad: 0, precioVentaUnidad: valor, precioVentaTotal: valor, beneficio: valor,
      });

      (async () => {
        if (navigator.onLine) {
          try {
            const res = await fetch(`${API}/ventas/manoobra`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payloadManoObra),
            });
            if (res.ok) {
              queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
              queryClient.invalidateQueries({ queryKey: ["/api/manoobra"] });
              queryClient.invalidateQueries({ queryKey: ["/api/trabajadores"] });
              limpiarFilaManoObra();
              return;
            }
            if (navigator.onLine) {
              const errData = await res.json().catch(() => null);
              toast({ title: "No se pudo guardar", description: errData?.error || `Error del servidor (${res.status})`, variant: "destructive" });
              return;
            }
          } catch {
            // sigue abajo, se encola
          }
        }
        await encolarOperacion({ tipo: "manoobra_venta", metodo: "POST", endpoint: "/ventas/manoobra", payload: payloadManoObra });
        toast({ title: "Guardado sin conexión", description: "Esta mano de obra se sincronizará automáticamente cuando vuelva internet." });
        limpiarFilaManoObra();
      })();

      return;
    }

    if (modoActual === "abono") {
      if (!newRow.productoNombreManual || !newRow.valorAbono) { alert("Completa el nombre y el valor del abono"); return; }

      const payloadAbono = {
        fecha, referencia: newRow.referencia, tipoLinea: "credito" as const,
        productoNombre: `Abono A: ${newRow.productoNombreManual}`,
        cantidad: 1, precioCompraUnidad: 0, precioVentaUnidad: newRow.valorAbono,
        precioVentaTotal: newRow.valorAbono, beneficio: 0, descripcion: "Abono a crédito",
      };

      agregarFilaOptimista(queryClient, fecha, payloadAbono);

      crearMutation.mutate(
        { data: payloadAbono },
         {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
            queryClient.invalidateQueries({ queryKey: ["/api/inventario"] });
            queryClient.invalidateQueries({ queryKey: ["/api/compras"] });
            setNewRow((prev) => ({ ...prev, productoSeleccionado: "", productoNombreManual: "", valorAbono: 0 }));
          },
          onError: async (error) => {
            if (!esFalloDeRed(error)) {
              toast({ title: "No se pudo guardar", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
              return;
            }
            await encolarOperacion({ tipo: "venta", metodo: "POST", endpoint: "/ventas", payload: payloadAbono });
            toast({ title: "Guardado sin conexión", description: "Este abono se sincronizará automáticamente cuando vuelva internet." });
            setNewRow((prev) => ({ ...prev, productoSeleccionado: "", productoNombreManual: "", valorAbono: 0 }));
          },
        }
      );
      return;
    }

    const prod = productos?.find((p) => String(p.id) === newRow.productoSeleccionado);
    const nombreProducto = prod?.nombre || "";
    if (!nombreProducto) { alert("Selecciona un producto del inventario"); return; }
    const cantNumNueva = parseFloat(newRow.cantidad.replace(",", "."));
    if (isNaN(cantNumNueva) || cantNumNueva <= 0) { alert("Cantidad inválida. Usa coma para decimales, ej: 1,5"); return; }
    const beneficio = (newRow.precioVenta - newRow.precioCompra) * cantNumNueva;
    const total = newRow.precioVenta * cantNumNueva;

    const payloadVenta = {
      fecha, referencia: newRow.referencia, tipoLinea: "venta" as const,
      productoId: prod ? prod.id : undefined, productoNombre: nombreProducto,
      productoCodigo: prod?.codigo, productoMarca: newRow.marca || prod?.marca || undefined,
      cantidad: cantNumNueva, precioCompraUnidad: newRow.precioCompra,
      precioVentaUnidad: newRow.precioVenta, precioVentaTotal: total, beneficio,
      formaPago: newRow.formaPago,
    };

    agregarFilaOptimista(queryClient, fecha, payloadVenta);

    crearMutation.mutate(
      { data: payloadVenta },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
          queryClient.invalidateQueries({ queryKey: ["/api/inventario"] });
          queryClient.invalidateQueries({ queryKey: ["/api/compras"] });
          setNewRow((prev) => ({ ...prev, productoSeleccionado: "", marca: "", cantidad: "1", precioCompra: 0, precioVenta: 0 }));
          setStockAlerta(null);
        },
        onError: async (error) => {
          if (!esFalloDeRed(error)) {
            toast({ title: "No se pudo guardar", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
            return;
          }
          await encolarOperacion({ tipo: "venta", metodo: "POST", endpoint: "/ventas", payload: payloadVenta });
          toast({ title: "Guardado sin conexión", description: "Esta venta se sincronizará automáticamente cuando vuelva internet." });
          setNewRow((prev) => ({ ...prev, productoSeleccionado: "", marca: "", cantidad: "1", precioCompra: 0, precioVenta: 0 }));
          setStockAlerta(null);
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
            queryClient.invalidateQueries({ queryKey: ["/api/compras"] });
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

  const ventasRows = ventas?.filter((v) => v.tipoLinea === "venta") || [];

  const totalPCompra = ventasRows.reduce((acc, v) => acc + v.precioCompraUnidad, 0);
  const totalPVenta = ventasRows.reduce((acc, v) => acc + v.precioVentaUnidad, 0);
  const totalVentaTotal = ventasRows.reduce((acc, v) => acc + v.precioVentaTotal, 0);
  const totalBeneficio = ventasRows.reduce((acc, v) => acc + v.beneficio, 0);
  const cantNum = parseFloat(newRow.cantidad.replace(",", ".")) || 0;
  const previewTotal = modoActual === "normal" ? newRow.precioVenta * cantNum : modoActual === "manoobra" || modoActual === "soldadura" ? newRow.precioManoObra : 0;
  const previewBeneficio = modoActual === "normal" ? (newRow.precioVenta - newRow.precioCompra) * cantNum : 0;

  const fechaFormateada = new Date(fecha + "T12:00:00").toLocaleDateString("es-CO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <Layout>
      <div className="space-y-5 pb-40">
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

        <div className="print-zone bg-card border border-border rounded-2xl overflow-hidden shadow-xl shadow-black/10">
          <div className="print-only print-date-header">
            Ventas Diarias — {fechaFormateada}
          </div>

          <div className="overflow-visible print:max-h-none print:overflow-visible">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={ventasOrdenadas.map((venta: any) => venta.id)} strategy={verticalListSortingStrategy}>
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
                  <th className="px-3 py-3 font-medium no-print whitespace-nowrap">Forma de Pago</th>
                  <th className="px-3 py-3 font-medium no-print w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">Cargando ventas...</td></tr>
                ) : ventasOrdenadas.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-6 text-center text-muted-foreground text-sm">Sin registros para esta fecha.</td></tr>
                ) : (
                  ventasOrdenadas.map((venta: any) => (
                    <FilaVentaSortable
                      key={venta.id}
                      venta={venta}
                      isEditing={editingId === venta.id}
                      editValues={editValues}
                      setEditValues={setEditValues}
                      onSaveEdit={handleSaveEdit}
                      onCancelEdit={() => setEditingId(null)}
                      onOpenEdit={openEdit}
                      onDelete={handleDelete}
                      guardando={actualizarMutation.isPending}
                    />
                  ))
                )}
                <tr ref={newRowRef} className={`no-print bg-background/40 scroll-mt-24 ${modoActual === "manoobra" || modoActual === "soldadura" ? "row-manoobra" : modoActual === "abono" ? "row-credito" : ""}`}>
                  <td className="p-2 no-print">
                    <button onClick={handleAddRow} disabled={crearMutation.isPending} className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shadow" title="Guardar fila">
                      <Save className="w-4 h-4" />
                    </button>
                  </td>
                  <td className="p-2">
                    <input type="text" placeholder="R 1234 24-ENE" value={newRow.referencia} onChange={(e) => setNewRow({ ...newRow, referencia: e.target.value })} className="w-full bg-background border border-border px-3 py-2 rounded-lg focus:ring-1 focus:ring-primary outline-none text-sm" />
                  </td>
                  <td className="p-2 min-w-[180px]">
                    <SearchableSelect opciones={opcionesProducto} value={newRow.productoSeleccionado} onChange={handleProductoSelect} placeholder="Seleccionar producto..." />
                    {modoActual === "normal" && stockAlerta !== null && (
                      stockAlerta.stock === 0 ? <p className="text-red-500 text-[11px] mt-1 leading-tight font-medium">⚠ Sin existencias — stock en 0</p> : stockAlerta.stock <= stockAlerta.minimo ? <p className="text-yellow-500 text-[11px] mt-1 leading-tight font-medium">⚠ Pocas existencias ({stockAlerta.stock} en stock)</p> : null
                    )}
                    {modoActual === "abono" && <input type="text" placeholder="Nombre cliente..." value={newRow.productoNombreManual} onChange={(e) => setNewRow({ ...newRow, productoNombreManual: e.target.value })} className="w-full mt-1 bg-background border border-blue-500/50 px-3 py-1.5 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />}
                  </td>
                  <td className="p-2">
                    {modoActual === "normal" && <input type="text" value={newRow.marca || "X"} readOnly disabled className="w-20 bg-muted border border-border px-2 py-2 rounded-lg text-sm text-muted-foreground cursor-not-allowed" />}
                    {(modoActual === "manoobra" || modoActual === "soldadura") && <div className="max-w-[160px]"><ManoObraSelector trabajadores={trabajadores || []} total={newRow.precioManoObra} seleccionados={newRow.trabajadoresSeleccionados} fijados={newRow.valoresFijados} onChangeSeleccionados={(ids) => setNewRow((prev) => ({ ...prev, trabajadoresSeleccionados: ids }))} onChangeFijados={(fijados) => setNewRow((prev) => ({ ...prev, valoresFijados: fijados }))} /></div>}
                    {modoActual === "abono" && <span className="text-xs text-blue-400 italic">Abono</span>}
                  </td>
                  <td className="p-2">
                    {modoActual === "normal" && <input type="number" min="0" step="0.25" placeholder="1" value={newRow.cantidad} onChange={(e) => setNewRow({ ...newRow, cantidad: e.target.value })} className="w-20 bg-background border border-border px-2 py-2 rounded-lg focus:ring-1 focus:ring-primary outline-none text-sm" />}
                    {(modoActual === "manoobra" || modoActual === "soldadura") && <span className="text-xs text-muted-foreground">{newRow.trabajadoresSeleccionados.length} trab.</span>}
                    {modoActual === "abono" && <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="p-2">
                    {modoActual === "normal" && <input type="number" value={newRow.precioCompra || ""} onChange={(e) => setNewRow({ ...newRow, precioCompra: parseFloat(e.target.value) || 0 })} className="w-24 bg-background border border-border px-2 py-2 rounded-lg focus:ring-1 focus:ring-primary outline-none text-sm" placeholder="P.Compra" />}
                    {(modoActual === "manoobra" || modoActual === "soldadura") && <input type="number" value={newRow.precioManoObra || ""} onChange={(e) => setNewRow({ ...newRow, precioManoObra: parseFloat(e.target.value) || 0 })} className="w-24 bg-background border border-yellow-500/50 px-2 py-2 rounded-lg focus:ring-1 focus:ring-yellow-500 outline-none text-sm" placeholder="Valor servicio" />}
                    {modoActual === "abono" && <input type="number" value={newRow.valorAbono || ""} onChange={(e) => setNewRow({ ...newRow, valorAbono: parseFloat(e.target.value) || 0 })} className="w-24 bg-background border border-blue-500/50 px-2 py-2 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="Valor" />}
                  </td>
                  <td className="p-2">{modoActual === "normal" ? <input type="number" value={newRow.precioVenta || ""} onChange={(e) => setNewRow({ ...newRow, precioVenta: parseFloat(e.target.value) || 0 })} className="w-24 bg-background border border-border px-2 py-2 rounded-lg focus:ring-1 focus:ring-primary outline-none text-sm" placeholder="P.Venta" /> : <span className="text-xs text-muted-foreground px-2">—</span>}</td>
                  <td className="p-2 font-medium text-primary whitespace-nowrap">{formatCurrency(previewTotal)}</td>
                  <td className="p-2 font-medium text-green-500 whitespace-nowrap">{modoActual === "normal" ? formatCurrency(previewBeneficio) : "—"}</td>
                  <td className="p-2 no-print"><select value={newRow.formaPago} onChange={(e) => setNewRow({ ...newRow, formaPago: e.target.value })} className="w-full bg-background border border-border px-2 py-2 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none"><option value="efectivo">Efectivo</option><option value="cuenta_ernesto">Cuenta Ernesto</option><option value="cuenta_olga">Cuenta Olga</option><option value="cuenta_juan">Cuenta Juan</option></select></td>
                  <td className="p-2 no-print"></td>
                </tr>
              </tbody>

              <tfoot className="border-t-2 border-border">
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
                    <td className="no-print"></td>
                  </tr>
                )}
              </tfoot>
            </table>
            </SortableContext>
            </DndContext>
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