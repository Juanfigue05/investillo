import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { formatCurrency } from "@/lib/utils";
import { History, ChevronDown, ChevronUp, Trash2, AlertCircle, Pencil } from "lucide-react";

// ---------- types ----------
interface CierreGuardado {
  id: number;
  fecha: string;
  totalPagar: number;
  creadoEn: string;
  datos: TrabajadorSnapshot[];
}

interface TrabajadorSnapshot {
  id: string;
  nombre: string;
  moEntradas: string[];
  seguro: string;
  leDamos: { descripcion: string; valor: string }[];
  nosDebe: { descripcion: string; valor: string }[];
  calc: {
    mo: number;
    descuento: number;
    seguro: number;
    leDamos: number;
    nosDebe: number;
    total: number;
  };
}

// ---------- API ----------
const BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");

async function fetchCierres(): Promise<CierreGuardado[]> {
  const res = await fetch(`${BASE}/cierre-diario`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function deleteCierre(id: number) {
  const res = await fetch(`${BASE}/cierre-diario/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ---------- helpers ----------
const fmtFecha = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-CO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

function trabajadoresDe(datos: any): any[] {
  return Array.isArray(datos) ? datos : (datos?.trabajadores || []);
}

function totalEfectivoCierre(datos: any): number {
  return trabajadoresDe(datos).reduce((suma, trabajador) => suma + Math.max(0, Number(trabajador?.calc?.total) || 0), 0);
}

const NOMBRES_MES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function agruparPorAnioMes(cierres: CierreGuardado[]) {
  const porAnio = new Map<string, Map<string, CierreGuardado[]>>();
  for (const cierre of cierres) {
    const [anio, mes] = cierre.fecha.split("-");
    if (!porAnio.has(anio)) porAnio.set(anio, new Map());
    const meses = porAnio.get(anio)!;
    if (!meses.has(mes)) meses.set(mes, []);
    meses.get(mes)!.push(cierre);
  }
  return [...porAnio.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([anio, meses]) => ({
    anio,
    meses: [...meses.entries()].sort((a, b) => b[0].localeCompare(a[0])),
  }));
}

// ---------- main ----------
export default function HistorialCierres() {
  const [, navigate] = useLocation();
  const [cierres, setCierres] = useState<CierreGuardado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState<number | null>(null);
  const [filtroAnio, setFiltroAnio] = useState("");
  const [filtroMes, setFiltroMes] = useState("");
  const [filtroDia, setFiltroDia] = useState("");
  const aniosDisponibles = useMemo(() => [...new Set(cierres.map((cierre) => cierre.fecha.slice(0, 4)))].sort((a, b) => b.localeCompare(a)), [cierres]);
  const cierresFiltrados = useMemo(() => cierres.filter((cierre) => {
    const [anio, mes] = cierre.fecha.split("-");
    return (!filtroAnio || anio === filtroAnio) && (!filtroMes || mes === filtroMes) && (!filtroDia || cierre.fecha === filtroDia);
  }), [cierres, filtroAnio, filtroMes, filtroDia]);
  const grupos = useMemo(() => agruparPorAnioMes(cierresFiltrados), [cierresFiltrados]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCierres();
      setCierres(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleEditar = (c: CierreGuardado) => {
    sessionStorage.setItem("editarCierre", JSON.stringify({ fecha: c.fecha, datos: c.datos }));
    navigate("/cierre-diario");
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar este cierre del historial?")) return;
    setDeleting(id);
    try {
      await deleteCierre(id);
      setCierres((prev) => prev.filter((c) => c.id !== id));
    } catch {
      alert("Error al eliminar");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <History className="w-6 h-6 text-primary" /> Historial de Cierres
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cierres guardados ordenados del más reciente al más antiguo.
          </p>
          <div className="flex flex-wrap items-end gap-3 mt-4 p-3 bg-card border border-border rounded-xl">
            <label className="text-xs text-muted-foreground">Año<select value={filtroAnio} onChange={(e) => setFiltroAnio(e.target.value)} className="block mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"><option value="">Todos</option>{aniosDisponibles.map((anio) => <option key={anio} value={anio}>{anio}</option>)}</select></label>
            <label className="text-xs text-muted-foreground">Mes<select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className="block mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground">{NOMBRES_MES.map((mes, index) => index === 0 ? <option key="todos" value="">Todos</option> : <option key={mes} value={String(index).padStart(2, "0")}>{mes}</option>)}</select></label>
            <label className="text-xs text-muted-foreground">Día específico<input type="date" value={filtroDia} onChange={(e) => setFiltroDia(e.target.value)} className="block mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground" /></label>
            {(filtroAnio || filtroMes || filtroDia) && <button onClick={() => { setFiltroAnio(""); setFiltroMes(""); setFiltroDia(""); }} className="px-3 py-2 text-sm rounded-lg bg-muted text-foreground hover:bg-muted/80">Limpiar filtros</button>}
          </div>
        </div>

        {/* States */}
        {loading && (
          <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
            Cargando...
          </div>
        )}
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}
        {!loading && !error && cierres.length === 0 && (
          <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
            <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay cierres guardados aún.</p>
            <p className="text-xs mt-1 opacity-60">Usa la sección Cierre Diario para calcular y guardar.</p>
          </div>
        )}
        {!loading && !error && cierres.length > 0 && cierresFiltrados.length === 0 && (
          <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">No hay cierres que coincidan con los filtros seleccionados.</div>
        )}

        {/* List */}
        <div className={`space-y-6 ${cierresFiltrados.length === 0 ? "hidden" : ""}`}>
          {grupos.map((grupo) => {
            const totalAnio = grupo.meses.flatMap(([, items]) => items).reduce((suma, c) => suma + totalEfectivoCierre(c.datos), 0);
            return (
              <section key={grupo.anio} className="space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h2 className="text-lg font-bold text-foreground">{grupo.anio}</h2>
                  <span className="text-sm font-semibold text-primary">Total año: {formatCurrency(totalAnio)}</span>
                </div>
                {grupo.meses.map(([mes, cierresMes]) => (
                  <div key={`${grupo.anio}-${mes}`} className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-sm font-semibold text-muted-foreground">{NOMBRES_MES[Number(mes)]}</h3>
                      <span className="text-xs font-semibold text-primary">Total mes: {formatCurrency(cierresMes.reduce((suma, c) => suma + totalEfectivoCierre(c.datos), 0))}</span>
                    </div>
                    {cierresMes.map((c) => {
            const isExpanded = expanded.has(c.id);
            const fechaLabel = fmtFecha(c.fecha);
            const totalEfectivo = totalEfectivoCierre(c.datos);
            return (
              <div key={c.id} className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
                {/* Row header */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors select-none"
                  onClick={() => toggleExpanded(c.id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    <div>
                      <p className="font-semibold text-foreground capitalize">{fechaLabel}</p>
                      <p className="text-xs text-muted-foreground">
                        {trabajadoresDe(c.datos).length} trabajador{trabajadoresDe(c.datos).length !== 1 ? "es" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Total a pagar</p>
                      <p className="text-lg font-bold text-primary">{formatCurrency(totalEfectivo)}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditar(c); }}
                      className="p-1.5 text-muted-foreground hover:text-primary bg-muted rounded-lg transition-colors"
                      title="Editar cierre"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                      disabled={deleting === c.id}
                      className="p-1.5 text-muted-foreground hover:text-destructive bg-muted rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Worker detail */}
                {isExpanded && (
                  <div className="border-t border-border px-5 pb-5 pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {trabajadoresDe(c.datos).map((t) => (
                        <div key={t.id} className="bg-muted/30 border border-border rounded-xl p-4">
                          <p className="font-semibold text-foreground mb-3">{t.nombre}</p>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Total MO</span>
                              <span>{formatCurrency(t.calc.mo)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Desc. 30%</span>
                              <span className="text-destructive">− {formatCurrency(t.calc.descuento)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Seguro</span>
                              <span className="text-destructive">− {formatCurrency(t.calc.seguro)}</span>
                            </div>
                            {t.calc.leDamos > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Le damos</span>
                                <span className="text-green-400">+ {formatCurrency(t.calc.leDamos)}</span>
                              </div>
                            )}
                            {t.calc.nosDebe > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Nos debe</span>
                                <span className="text-destructive">− {formatCurrency(t.calc.nosDebe)}</span>
                              </div>
                            )}
                            {/* Le damos details */}
                            {t.leDamos.filter((e: { descripcion: string; valor: string }) => e.valor).map((e: { descripcion: string; valor: string }, i: number) => (
                              <div key={i} className="flex justify-between pl-3 text-muted-foreground/70">
                                <span>{e.descripcion || "—"}</span>
                                <span>{formatCurrency(parseFloat(e.valor.replace(",", ".")) * 1000)}</span>
                              </div>
                            ))}
                            {/* Nos debe details */}
                            {t.nosDebe.filter((e: { descripcion: string; valor: string }) => e.valor).map((e: { descripcion: string; valor: string }, i: number) => (
                              <div key={i} className="flex justify-between pl-3 text-muted-foreground/70">
                                <span>{e.descripcion || "—"}</span>
                                <span>{formatCurrency(parseFloat(e.valor.replace(",", ".")) * 1000)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="border-t border-border mt-3 pt-2 flex justify-between">
                            <span className="text-xs font-bold text-foreground">Total</span>
                            <span className="text-sm font-bold text-primary">
                              {formatCurrency(Math.max(0, Number(t.calc.total) || 0))}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
                    })}
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
