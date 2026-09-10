import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import {
  useGetHistorial,
  useActualizarHistorial,
  useEliminarHistorial,
  useActualizarVenta,
  useEliminarVenta,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { ChevronDown, ChevronUp, Pencil, Trash2, Check, X, BookOpen } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface EditVentaValues {
  referencia: string;
  productoNombre: string;
  productoMarca: string;
  cantidad: string;
  precioCompraUnidad: string;
  precioVentaUnidad: string;
}

const NOMBRES_MES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

type VentaAgrupada = { tipoLinea: string; precioVentaTotal: number; [key: string]: any };
type DiaAgrupado = { fecha: string; ventas: VentaAgrupada[]; [key: string]: any };

function agruparPorAnioMes(dias: DiaAgrupado[]): { anio: string; meses: [string, DiaAgrupado[]][] }[] {
  const porAnio = new Map<string, Map<string, DiaAgrupado[]>>();
  for (const dia of dias) {
    const [anio, mes] = dia.fecha.split("-");
    if (!porAnio.has(anio)) porAnio.set(anio, new Map());
    const meses = porAnio.get(anio)!;
    if (!meses.has(mes)) meses.set(mes, []);
    meses.get(mes)!.push(dia);
  }
  return [...porAnio.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([anio, meses]) => ({
    anio,
    meses: [...meses.entries()].sort((a, b) => b[0].localeCompare(a[0])),
  }));
}

export default function Historial() {
  const { data: historial, isLoading } = useGetHistorial();
  const queryClient = useQueryClient();

  const actualizarHistorialMutation = useActualizarHistorial();
  const eliminarHistorialMutation = useEliminarHistorial();
  const actualizarVentaMutation = useActualizarVenta();
  const eliminarVentaMutation = useEliminarVenta();

  const [expandedDia, setExpandedDia] = useState<number | null>(null);
  const [filtroAnio, setFiltroAnio] = useState("");
  const [filtroMes, setFiltroMes] = useState("");
  const [filtroDia, setFiltroDia] = useState("");
  const aniosDisponibles = useMemo(() => [...new Set((historial || []).map((dia) => dia.fecha.slice(0, 4)))].sort((a, b) => b.localeCompare(a)), [historial]);
  const historialFiltrado = useMemo(() => (historial || []).filter((dia) => {
    const [anio, mes] = dia.fecha.split("-");
    return (!filtroAnio || anio === filtroAnio) && (!filtroMes || mes === filtroMes) && (!filtroDia || dia.fecha === filtroDia);
  }), [historial, filtroAnio, filtroMes, filtroDia]);
  const grupos = useMemo(() => agruparPorAnioMes(historialFiltrado as any[]), [historialFiltrado]);

  // Notas editing
  const [editingNotasDia, setEditingNotasDia] = useState<number | null>(null);
  const [notasValue, setNotasValue] = useState("");

  // Inline venta editing
  const [editingVentaId, setEditingVentaId] = useState<number | null>(null);
  const [editVentaValues, setEditVentaValues] = useState<EditVentaValues>({
    referencia: "", productoNombre: "", productoMarca: "",
    cantidad: "1", precioCompraUnidad: "0", precioVentaUnidad: "0",
  });

  const openEditNotas = (id: number, notas: string | null | undefined) => {
    setEditingNotasDia(id);
    setNotasValue(notas || "");
  };

  const handleSaveNotas = (id: number) => {
    actualizarHistorialMutation.mutate(
      { id, data: { notas: notasValue || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/historial"] });
          setEditingNotasDia(null);
        },
      }
    );
  };

  const handleDeleteDia = (id: number, fecha: string) => {
    if (confirm(`¿Eliminar el día ${new Date(fecha + "T12:00:00").toLocaleDateString("es-CO")} del historial?\n\nLas ventas de ese día no se eliminan — solo se quita del historial.`)) {
      eliminarHistorialMutation.mutate(
        { id },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/historial"] }) }
      );
    }
  };

  const openEditVenta = (venta: NonNullable<NonNullable<typeof historial>[number]["ventas"]>[number]) => {
    setEditingVentaId(venta.id);
    setEditVentaValues({
      referencia: venta.referencia,
      productoNombre: venta.productoNombre || "",
      productoMarca: venta.productoMarca || "",
      cantidad: String(venta.cantidad),
      precioCompraUnidad: String(venta.precioCompraUnidad),
      precioVentaUnidad: String(venta.precioVentaUnidad),
    });
  };

  const handleSaveVenta = (venta: NonNullable<NonNullable<typeof historial>[number]["ventas"]>[number]) => {
    const cant = parseFloat(editVentaValues.cantidad) || 0;
    const pvU = parseFloat(editVentaValues.precioVentaUnidad) || 0;
    const pcU = parseFloat(editVentaValues.precioCompraUnidad) || 0;
    const total = pvU * cant;
    const beneficio = venta.tipoLinea === "venta" ? (pvU - pcU) * cant : 0;
    actualizarVentaMutation.mutate(
      {
        id: venta.id,
        data: {
          fecha: venta.fecha, referencia: editVentaValues.referencia, tipoLinea: venta.tipoLinea,
          productoId: venta.productoId || undefined, productoNombre: editVentaValues.productoNombre || undefined,
          productoCodigo: venta.productoCodigo || undefined, productoMarca: editVentaValues.productoMarca || undefined,
          cantidad: cant, precioCompraUnidad: pcU, precioVentaUnidad: pvU, precioVentaTotal: total, beneficio,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/historial"] });
          setEditingVentaId(null);
        },
      }
    );
  };

  const handleDeleteVenta = (id: number) => {
    if (confirm("¿Eliminar esta fila de ventas?")) {
      eliminarVentaMutation.mutate(
        { id },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/historial"] }) }
      );
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-primary" />
              Historial de Ventas
            </h1>
            <p className="text-muted-foreground mt-1">
              Días guardados desde Ventas Diarias. La fecha es inmutable; las ventas son editables.
            </p>
            <div className="flex flex-wrap items-end gap-3 mt-4 p-3 bg-card border border-border rounded-xl">
              <label className="text-xs text-muted-foreground">Año<select value={filtroAnio} onChange={(e) => setFiltroAnio(e.target.value)} className="block mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"><option value="">Todos</option>{aniosDisponibles.map((anio) => <option key={anio} value={anio}>{anio}</option>)}</select></label>
              <label className="text-xs text-muted-foreground">Mes<select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className="block mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground">{NOMBRES_MES.map((mes, index) => index === 0 ? <option key="todos" value="">Todos</option> : <option key={mes} value={String(index).padStart(2, "0")}>{mes}</option>)}</select></label>
              <label className="text-xs text-muted-foreground">Día específico<input type="date" value={filtroDia} onChange={(e) => setFiltroDia(e.target.value)} className="block mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground" /></label>
              {(filtroAnio || filtroMes || filtroDia) && <button onClick={() => { setFiltroAnio(""); setFiltroMes(""); setFiltroDia(""); }} className="px-3 py-2 text-sm rounded-lg bg-muted text-foreground hover:bg-muted/80">Limpiar filtros</button>}
            </div>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="py-16 text-center text-muted-foreground">Cargando historial...</div>
        ) : !historial || historial.length === 0 ? (
          <div className="py-16 text-center bg-card rounded-2xl border border-border">
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="text-muted-foreground font-medium">No hay días guardados aún.</p>
            <p className="text-sm text-muted-foreground mt-1">Ve a <strong>Ventas Diarias</strong> y presiona <em>Guardar en Historial</em>.</p>
          </div>
        ) : (
          <div className={`space-y-6 ${historialFiltrado.length === 0 ? "hidden" : ""}`}>
            {grupos.map((grupo) => {
              const totalAnio = grupo.meses.flatMap(([, items]) => items).reduce((suma, dia) => suma + dia.ventas.filter((v) => v.tipoLinea === "venta").reduce((s, v) => s + v.precioVentaTotal, 0), 0);
              return (
                <section key={grupo.anio} className="space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <h2 className="text-lg font-bold text-foreground">{grupo.anio}</h2>
                    <span className="text-sm font-semibold text-primary">Total año: {formatCurrency(totalAnio)}</span>
                  </div>
                  {grupo.meses.map(([mes, dias]) => {
                    const totalMes = dias.reduce((suma, dia) => suma + dia.ventas.filter((v) => v.tipoLinea === "venta").reduce((s, v) => s + v.precioVentaTotal, 0), 0);
                    return (
                      <div key={`${grupo.anio}-${mes}`} className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                          <h3 className="text-sm font-semibold text-muted-foreground">{NOMBRES_MES[Number(mes)]}</h3>
                          <span className="text-xs font-semibold text-primary">Total mes: {formatCurrency(totalMes)}</span>
                        </div>
                        {dias.map((dia) => {
              const fechaLabel = new Date(dia.fecha + "T12:00:00").toLocaleDateString("es-CO", {
                weekday: "long", year: "numeric", month: "long", day: "numeric",
              });
              const totalVentas = dia.ventas.filter((v) => v.tipoLinea === "venta").reduce((s, v) => s + v.precioVentaTotal, 0);
              const isOpen = expandedDia === dia.id;

              return (
                <div key={dia.id} className="bg-card border border-border rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all">
                  {/* Card header */}
                  <div
                    className="flex items-center justify-between p-5 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedDia(isOpen ? null : dia.id)}
                  >
                    <div className="flex-1">
                      <h3 className="font-bold text-foreground capitalize">{fechaLabel}</h3>
                      <div className="flex flex-wrap gap-4 mt-1 text-sm text-muted-foreground">
                        <span>{dia.ventas.length} registro{dia.ventas.length !== 1 ? "s" : ""}</span>
                        {totalVentas > 0 && <span className="text-primary font-medium">Ventas: {formatCurrency(totalVentas)}</span>}
                        <span className="text-muted-foreground text-xs">
                          Guardado el {new Date(dia.guardadoEn).toLocaleDateString("es-CO")}
                        </span>
                      </div>
                      {dia.notas && !isOpen && (
                        <p className="mt-1 text-xs text-muted-foreground italic truncate max-w-xl">{dia.notas}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openEditNotas(dia.id, dia.notas)}
                        className="p-2 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors"
                        title="Editar notas"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteDia(dia.id, dia.fecha)}
                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-muted rounded-lg transition-colors"
                        title="Quitar del historial"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {isOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                    </div>
                  </div>

                  {/* Edit notas inline */}
                  {editingNotasDia === dia.id && (
                    <div className="px-5 pb-4 border-t border-border bg-muted/20 animate-in fade-in" onClick={(e) => e.stopPropagation()}>
                      <label className="block text-xs font-medium text-muted-foreground mb-2 mt-3">Notas del día</label>
                      <textarea
                        autoFocus
                        rows={3}
                        value={notasValue}
                        onChange={(e) => setNotasValue(e.target.value)}
                        placeholder="Observaciones, comentarios del día..."
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none"
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleSaveNotas(dia.id)}
                          disabled={actualizarHistorialMutation.isPending}
                          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                        >
                          <Check className="w-4 h-4" /> Guardar
                        </button>
                        <button
                          onClick={() => setEditingNotasDia(null)}
                          className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors border border-border"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Expanded: ventas table */}
                  {isOpen && (
                    <div className="border-t border-border">
                      {dia.notas && editingNotasDia !== dia.id && (
                        <div className="px-5 py-3 bg-muted/20 border-b border-border">
                          <p className="text-sm text-muted-foreground italic">{dia.notas}</p>
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/50 text-muted-foreground border-b border-border">
                              <th className="px-4 py-2.5 font-medium text-left whitespace-nowrap">Ref</th>
                              <th className="px-4 py-2.5 font-medium text-left whitespace-nowrap">Producto</th>
                              <th className="px-4 py-2.5 font-medium text-left whitespace-nowrap">Marca</th>
                              <th className="px-4 py-2.5 font-medium text-left whitespace-nowrap">Cant</th>
                              <th className="px-4 py-2.5 font-medium text-left whitespace-nowrap">P. Compra</th>
                              <th className="px-4 py-2.5 font-medium text-left whitespace-nowrap">P. Venta</th>
                              <th className="px-4 py-2.5 font-medium text-left whitespace-nowrap">Total</th>
                              <th className="px-4 py-2.5 w-20"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/50">
                            {dia.ventas.length === 0 ? (
                              <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground text-sm">Sin ventas registradas para este día.</td></tr>
                            ) : (
                              dia.ventas.map((venta) => {
                                const rowCls = venta.tipoLinea === "manoobra" ? "row-manoobra" : venta.tipoLinea === "credito" ? "row-credito" : "row-venta";
                                const isEditingV = editingVentaId === venta.id;

                                if (isEditingV) {
                                  const pvU = parseFloat(editVentaValues.precioVentaUnidad) || 0;
                                  const cant = parseFloat(editVentaValues.cantidad) || 0;
                                  return (
                                    <tr key={venta.id} className={`${rowCls} ring-2 ring-inset ring-primary/40`}>
                                      <td className="px-2 py-1.5"><input value={editVentaValues.referencia} onChange={(e) => setEditVentaValues((v) => ({ ...v, referencia: e.target.value }))} className="w-28 bg-background border border-primary/50 px-2 py-1 rounded-lg text-xs outline-none" /></td>
                                      <td className="px-2 py-1.5"><input value={editVentaValues.productoNombre} onChange={(e) => setEditVentaValues((v) => ({ ...v, productoNombre: e.target.value }))} className="w-36 bg-background border border-primary/50 px-2 py-1 rounded-lg text-xs outline-none" /></td>
                                      <td className="px-2 py-1.5"><input value={editVentaValues.productoMarca} onChange={(e) => setEditVentaValues((v) => ({ ...v, productoMarca: e.target.value }))} className="w-20 bg-background border border-primary/50 px-2 py-1 rounded-lg text-xs outline-none" /></td>
                                      <td className="px-2 py-1.5"><input type="number" value={editVentaValues.cantidad} onChange={(e) => setEditVentaValues((v) => ({ ...v, cantidad: e.target.value }))} className="w-14 bg-background border border-primary/50 px-2 py-1 rounded-lg text-xs outline-none" /></td>
                                      <td className="px-2 py-1.5"><input type="number" value={editVentaValues.precioCompraUnidad} onChange={(e) => setEditVentaValues((v) => ({ ...v, precioCompraUnidad: e.target.value }))} className="w-24 bg-background border border-primary/50 px-2 py-1 rounded-lg text-xs outline-none" /></td>
                                      <td className="px-2 py-1.5"><input type="number" value={editVentaValues.precioVentaUnidad} onChange={(e) => setEditVentaValues((v) => ({ ...v, precioVentaUnidad: e.target.value }))} className="w-24 bg-background border border-primary/50 px-2 py-1 rounded-lg text-xs outline-none" /></td>
                                      <td className="px-4 py-1.5 font-bold text-primary whitespace-nowrap">{formatCurrency(pvU * cant)}</td>
                                      <td className="px-2 py-1.5">
                                        <div className="flex gap-1">
                                          <button onClick={() => handleSaveVenta(venta as any)} disabled={actualizarVentaMutation.isPending} className="p-1 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors"><Check className="w-3.5 h-3.5" /></button>
                                          <button onClick={() => setEditingVentaId(null)} className="p-1 bg-muted text-muted-foreground rounded hover:bg-muted/80 transition-colors"><X className="w-3.5 h-3.5" /></button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                }

                                return (
                                  <tr key={venta.id} className={`${rowCls} group hover:brightness-110 transition-all`}>
                                    <td className="px-4 py-2.5 font-mono text-xs">{venta.referencia}</td>
                                    <td className="px-4 py-2.5 font-medium">{venta.productoNombre}</td>
                                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{venta.productoMarca || "—"}</td>
                                    <td className="px-4 py-2.5">{String(venta.cantidad).replace(".", ",")}</td>
                                    <td className="px-4 py-2.5 text-muted-foreground">{formatCurrency(venta.precioCompraUnidad)}</td>
                                    <td className="px-4 py-2.5 text-muted-foreground">{formatCurrency(venta.precioVentaUnidad)}</td>
                                    <td className="px-4 py-2.5 font-bold text-primary">{formatCurrency(venta.precioVentaTotal)}</td>
                                    <td className="px-2 py-2.5">
                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                        <button onClick={() => openEditVenta(venta as any)} className="p-1 text-muted-foreground hover:text-primary rounded transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => handleDeleteVenta(venta.id)} className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                          {dia.ventas.length > 0 && (
                            <tfoot className="border-t border-border bg-muted/30">
                              <tr>
                                <td colSpan={6} className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Total ventas del día</td>
                                <td className="px-4 py-2 font-bold text-primary">{formatCurrency(totalVentas)}</td>
                                <td></td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
                        })}
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        )}
        {!isLoading && historial && historial.length > 0 && historialFiltrado.length === 0 && (
          <div className="py-16 text-center bg-card rounded-2xl border border-border text-muted-foreground">No hay días que coincidan con los filtros seleccionados.</div>
        )}
      </div>
    </Layout>
  );
}
