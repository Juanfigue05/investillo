import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/Layout";
import {
  useGetVentas,
  useCrearVenta,
  useGetInventario,
  useEliminarVenta,
  useGetTrabajadores,
  useCrearManoObra,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Printer, Save, Trash2, ChevronDown, X } from "lucide-react";
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

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setBusqueda("");
  };

  return (
    <div ref={containerRef} className="relative w-full min-w-[180px]">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open) setBusqueda("");
        }}
        className="w-full flex items-center justify-between bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none text-left"
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected ? selected.nombre : placeholder || "Seleccionar..."}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-2" />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
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
                    o.special === "manoobra"
                      ? "text-yellow-400 font-medium"
                      : o.special === "abono"
                      ? "text-blue-400 font-medium"
                      : "text-foreground"
                  }`}
                >
                  {o.nombre}
                  {o.marca && <span className="text-muted-foreground text-xs">— {o.marca}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function VentasDiarias() {
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const { data: ventas, isLoading } = useGetVentas({ fecha });
  const { data: productos } = useGetInventario();
  const { data: trabajadores } = useGetTrabajadores();

  const queryClient = useQueryClient();
  const crearMutation = useCrearVenta();
  const eliminarMutation = useEliminarVenta();
  const crearManoObraMutation = useCrearManoObra();

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

  // Build opciones for searchable select
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
    newRow.productoSeleccionado === SPECIAL_MANOOBRA
      ? "manoobra"
      : newRow.productoSeleccionado === SPECIAL_ABONO
      ? "abono"
      : "normal";

  const handleProductoSelect = (id: string) => {
    if (id === SPECIAL_MANOOBRA) {
      setNewRow((prev) => ({
        ...prev,
        productoSeleccionado: id,
        marca: "",
        cantidad: "1",
        precioCompra: 0,
        precioVenta: 0,
        precioManoObra: 0,
        valorAbono: 0,
        trabajadoresSeleccionados: [],
      }));
    } else if (id === SPECIAL_ABONO) {
      setNewRow((prev) => ({
        ...prev,
        productoSeleccionado: id,
        marca: "",
        cantidad: "1",
        precioCompra: 0,
        precioVenta: 0,
        precioManoObra: 0,
        valorAbono: 0,
        productoNombreManual: "",
      }));
    } else {
      const prod = productos?.find((p) => String(p.id) === id);
      if (prod) {
        setNewRow((prev) => ({
          ...prev,
          productoSeleccionado: id,
          marca: prod.marca || "",
          precioCompra: prod.precioCompra,
          precioVenta: prod.precioVentaConIva,
          trabajadoresSeleccionados: [],
        }));
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

  const handleAddRow = () => {
    if (!newRow.referencia) {
      alert("Escribe una referencia / No. Remisión");
      return;
    }

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
        return {
          trabajadorId: tid,
          trabajadorNombre: t?.nombre || `Trabajador ${tid}`,
          valor: i === n - 1 ? base + resto : base,
          descuentoSeguro: 0,
          descuentoOtros: 0,
        };
      });

      crearManoObraMutation.mutate(
        {
          data: {
            fecha,
            descripcion: newRow.referencia,
            valorTotal: valor,
            distribuciones,
          },
        },
        {
          onSuccess: () => {
            crearMutation.mutate(
              {
                data: {
                  fecha,
                  referencia: newRow.referencia,
                  tipoLinea: "manoobra",
                  productoNombre: "Mano de Obra",
                  productoMarca: newRow.trabajadoresSeleccionados
                    .map((tid) => trabajadores?.find((w) => w.id === tid)?.nombre || `T${tid}`)
                    .join(", "),
                  cantidad: 1,
                  precioCompraUnidad: 0,
                  precioVentaUnidad: valor,
                  precioVentaTotal: valor,
                  beneficio: valor,
                  descripcion: distribuciones.map((d) => `${d.trabajadorNombre}: ${formatCurrency(d.valor)}`).join(" | "),
                },
              },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/manoobra"] });
                  setNewRow((prev) => ({
                    ...prev,
                    productoSeleccionado: "",
                    marca: "",
                    cantidad: "1",
                    precioManoObra: 0,
                    trabajadoresSeleccionados: [],
                  }));
                },
              }
            );
          },
        }
      );
      return;
    }

    if (modoActual === "abono") {
      if (!newRow.productoNombreManual || !newRow.valorAbono) {
        alert("Completa el nombre y el valor del abono");
        return;
      }
      crearMutation.mutate(
        {
          data: {
            fecha,
            referencia: newRow.referencia,
            tipoLinea: "credito",
            productoNombre: newRow.productoNombreManual,
            cantidad: 1,
            precioCompraUnidad: 0,
            precioVentaUnidad: newRow.valorAbono,
            precioVentaTotal: newRow.valorAbono,
            beneficio: 0,
            descripcion: "Abono a crédito",
          },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
            setNewRow((prev) => ({
              ...prev,
              productoSeleccionado: "",
              productoNombreManual: "",
              valorAbono: 0,
            }));
          },
        }
      );
      return;
    }

    // Normal sale
    const prod = productos?.find((p) => String(p.id) === newRow.productoSeleccionado);
    const nombreProducto = prod?.nombre || "";
    if (!nombreProducto) {
      alert("Selecciona un producto del inventario");
      return;
    }
    const cantNum = parseFloat(newRow.cantidad.replace(",", "."));
    if (isNaN(cantNum) || cantNum <= 0) {
      alert("Cantidad inválida. Usa coma para decimales, ej: 1,5");
      return;
    }
    const beneficio = (newRow.precioVenta - newRow.precioCompra) * cantNum;
    const total = newRow.precioVenta * cantNum;

    crearMutation.mutate(
      {
        data: {
          fecha,
          referencia: newRow.referencia,
          tipoLinea: "venta",
          productoId: prod ? prod.id : undefined,
          productoNombre: nombreProducto,
          productoCodigo: prod?.codigo,
          productoMarca: newRow.marca || prod?.marca || undefined,
          cantidad: cantNum,
          precioCompraUnidad: newRow.precioCompra,
          precioVentaUnidad: newRow.precioVenta,
          precioVentaTotal: total,
          beneficio,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
          setNewRow((prev) => ({
            ...prev,
            productoSeleccionado: "",
            marca: "",
            cantidad: "1",
            precioCompra: 0,
            precioVenta: 0,
          }));
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    if (confirm("¿Eliminar esta fila?")) {
      eliminarMutation.mutate(
        { id },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ventas"] }) }
      );
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const totalVentas =
    ventas?.filter((v) => v.tipoLinea === "venta").reduce((acc, v) => acc + v.precioVentaTotal, 0) || 0;

  const cantNum = parseFloat(newRow.cantidad.replace(",", ".")) || 0;
  const previewTotal =
    modoActual === "normal" ? newRow.precioVenta * cantNum : modoActual === "manoobra" ? newRow.precioManoObra : 0;
  const previewBeneficio = modoActual === "normal" ? (newRow.precioVenta - newRow.precioCompra) * cantNum : 0;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Ventas Diarias</h1>
            <p className="text-muted-foreground mt-1">Registra las ventas del día directamente en la tabla.</p>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="bg-card border border-border text-foreground px-4 py-2 rounded-xl focus:ring-2 focus:ring-primary outline-none"
            />
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-5 py-2 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/80 transition-all border border-border"
            >
              <Printer className="w-5 h-5" />
              Imprimir
            </button>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl shadow-black/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-muted text-muted-foreground border-b border-border">
                  <th className="px-3 py-3 font-medium whitespace-nowrap">No. Remisión / Ref</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">Producto</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">Marca / Info</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">Cantidad</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">P. Compra</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">P. Venta</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap text-primary">Total</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap text-green-500">Beneficio</th>
                  <th className="px-3 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {/* New Row Input */}
                <tr className={`bg-background/40 ${modoActual === "manoobra" ? "row-manoobra" : modoActual === "abono" ? "row-credito" : ""}`}>
                  {/* Referencia */}
                  <td className="p-2">
                    <input
                      type="text"
                      placeholder="R 1234 24-ENE"
                      value={newRow.referencia}
                      onChange={(e) => setNewRow({ ...newRow, referencia: e.target.value })}
                      className="w-full bg-background border border-border px-3 py-2 rounded-lg focus:ring-1 focus:ring-primary outline-none"
                    />
                  </td>

                  {/* Producto - searchable */}
                  <td className="p-2 min-w-[200px]">
                    <SearchableSelect
                      opciones={opcionesProducto}
                      value={newRow.productoSeleccionado}
                      onChange={handleProductoSelect}
                      placeholder="Seleccionar producto..."
                    />
                    {/* Manual text for Abono */}
                    {modoActual === "abono" && (
                      <input
                        type="text"
                        placeholder="Nombre cliente / producto..."
                        value={newRow.productoNombreManual}
                        onChange={(e) => setNewRow({ ...newRow, productoNombreManual: e.target.value })}
                        className="w-full mt-1 bg-background border border-blue-500/50 px-3 py-1.5 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                      />
                    )}
                  </td>

                  {/* Marca / Info col — changes per mode */}
                  <td className="p-2">
                    {modoActual === "normal" && (
                      <input
                        type="text"
                        value={newRow.marca}
                        onChange={(e) => setNewRow({ ...newRow, marca: e.target.value })}
                        className="w-24 bg-background border border-border px-3 py-2 rounded-lg focus:ring-1 focus:ring-primary outline-none"
                        placeholder="Marca"
                      />
                    )}
                    {modoActual === "manoobra" && (
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {trabajadores?.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => toggleTrabajador(t.id)}
                            className={`px-2 py-1 rounded-lg border text-xs font-medium transition-all ${
                              newRow.trabajadoresSeleccionados.includes(t.id)
                                ? "bg-yellow-500/20 border-yellow-500 text-yellow-400"
                                : "bg-background border-border text-muted-foreground hover:border-yellow-500/50"
                            }`}
                          >
                            {t.nombre}
                          </button>
                        ))}
                      </div>
                    )}
                    {modoActual === "abono" && (
                      <span className="text-xs text-blue-400 italic">Abono</span>
                    )}
                  </td>

                  {/* Cantidad / Trabajadores label */}
                  <td className="p-2">
                    {modoActual === "normal" && (
                      <input
                        type="text"
                        placeholder="1"
                        value={newRow.cantidad}
                        onChange={(e) => setNewRow({ ...newRow, cantidad: e.target.value })}
                        className="w-16 bg-background border border-border px-2 py-2 rounded-lg focus:ring-1 focus:ring-primary outline-none"
                      />
                    )}
                    {modoActual === "manoobra" && (
                      <span className="text-xs text-muted-foreground">
                        {newRow.trabajadoresSeleccionados.length} trab.
                      </span>
                    )}
                    {modoActual === "abono" && <span className="text-xs text-muted-foreground">—</span>}
                  </td>

                  {/* Precio Compra / Precio M.O. */}
                  <td className="p-2">
                    {modoActual === "normal" && (
                      <input
                        type="number"
                        value={newRow.precioCompra || ""}
                        onChange={(e) => setNewRow({ ...newRow, precioCompra: parseFloat(e.target.value) || 0 })}
                        className="w-28 bg-background border border-border px-2 py-2 rounded-lg focus:ring-1 focus:ring-primary outline-none"
                        placeholder="P. Compra"
                      />
                    )}
                    {modoActual === "manoobra" && (
                      <input
                        type="number"
                        value={newRow.precioManoObra || ""}
                        onChange={(e) => setNewRow({ ...newRow, precioManoObra: parseFloat(e.target.value) || 0 })}
                        className="w-28 bg-background border border-yellow-500/50 px-2 py-2 rounded-lg focus:ring-1 focus:ring-yellow-500 outline-none"
                        placeholder="Precio M.O."
                      />
                    )}
                    {modoActual === "abono" && (
                      <input
                        type="number"
                        value={newRow.valorAbono || ""}
                        onChange={(e) => setNewRow({ ...newRow, valorAbono: parseFloat(e.target.value) || 0 })}
                        className="w-28 bg-background border border-blue-500/50 px-2 py-2 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none"
                        placeholder="Valor abono"
                      />
                    )}
                  </td>

                  {/* Precio Venta — only normal */}
                  <td className="p-2">
                    {modoActual === "normal" ? (
                      <input
                        type="number"
                        value={newRow.precioVenta || ""}
                        onChange={(e) => setNewRow({ ...newRow, precioVenta: parseFloat(e.target.value) || 0 })}
                        className="w-28 bg-background border border-border px-2 py-2 rounded-lg focus:ring-1 focus:ring-primary outline-none"
                        placeholder="P. Venta"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground px-2">—</span>
                    )}
                  </td>

                  {/* Preview total */}
                  <td className="p-2 font-medium text-primary whitespace-nowrap">
                    {formatCurrency(previewTotal)}
                  </td>
                  <td className="p-2 font-medium text-green-500 whitespace-nowrap">
                    {modoActual === "normal" ? formatCurrency(previewBeneficio) : "—"}
                  </td>

                  <td className="p-2">
                    <button
                      onClick={handleAddRow}
                      disabled={crearMutation.isPending || crearManoObraMutation.isPending}
                      className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shadow"
                      title="Guardar fila"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                  </td>
                </tr>

                {/* Registered rows */}
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      Cargando ventas...
                    </td>
                  </tr>
                ) : ventas?.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-muted-foreground text-sm">
                      Sin registros para esta fecha.
                    </td>
                  </tr>
                ) : (
                  ventas?.map((venta) => {
                    const rowCls =
                      venta.tipoLinea === "manoobra"
                        ? "row-manoobra"
                        : venta.tipoLinea === "credito"
                        ? "row-credito"
                        : "row-venta";
                    return (
                      <tr key={venta.id} className={`${rowCls} group hover:brightness-110 transition-all`}>
                        <td className="px-3 py-3 font-mono text-xs">{venta.referencia}</td>
                        <td className="px-3 py-3 font-medium">{venta.productoNombre}</td>
                        <td className="px-3 py-3 text-muted-foreground text-xs">{venta.productoMarca || "—"}</td>
                        <td className="px-3 py-3">{String(venta.cantidad).replace(".", ",")}</td>
                        <td className="px-3 py-3 text-muted-foreground">{formatCurrency(venta.precioCompraUnidad)}</td>
                        <td className="px-3 py-3 text-muted-foreground">{formatCurrency(venta.precioVentaUnidad)}</td>
                        <td className="px-3 py-3 font-bold text-primary">{formatCurrency(venta.precioVentaTotal)}</td>
                        <td className="px-3 py-3 font-medium text-green-500">
                          {venta.tipoLinea === "venta" ? formatCurrency(venta.beneficio) : "—"}
                        </td>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => handleDelete(venta.id)}
                            className="p-1.5 text-muted-foreground hover:text-destructive bg-background/50 rounded-lg opacity-0 group-hover:opacity-100 transition-all border border-border"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot className="bg-card border-t-2 border-border">
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-4 text-right font-medium text-muted-foreground uppercase text-xs tracking-wider"
                  >
                    Total Ventas del Día (excluye M.O. y Abonos)
                  </td>
                  <td className="px-4 py-4 font-display font-bold text-2xl text-primary">
                    {formatCurrency(totalVentas)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-xs font-medium uppercase tracking-wider text-muted-foreground p-4 bg-card rounded-xl border border-border">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-background border border-border"></div> Venta Normal
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500/30 border border-yellow-500/50"></div> Mano de Obra
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500/30 border border-blue-500/50"></div> Crédito / Abono
          </div>
        </div>
      </div>
    </Layout>
  );
}
