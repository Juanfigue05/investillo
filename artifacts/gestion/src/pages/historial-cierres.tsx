import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { formatCurrency } from "@/lib/utils";
import { History, ChevronDown, ChevronUp, Trash2, AlertCircle } from "lucide-react";

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

// ---------- main ----------
export default function HistorialCierres() {
  const [cierres, setCierres] = useState<CierreGuardado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState<number | null>(null);

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

        {/* List */}
        <div className="space-y-4">
          {cierres.map((c) => {
            const isExpanded = expanded.has(c.id);
            const fechaLabel = fmtFecha(c.fecha);
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
                        {c.datos.length} trabajador{c.datos.length !== 1 ? "es" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Total a pagar</p>
                      <p className="text-lg font-bold text-primary">{formatCurrency(c.totalPagar)}</p>
                    </div>
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
                      {c.datos.map((t) => (
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
                            {t.leDamos.filter((e) => e.valor).map((e, i) => (
                              <div key={i} className="flex justify-between pl-3 text-muted-foreground/70">
                                <span>{e.descripcion || "—"}</span>
                                <span>{formatCurrency(parseFloat(e.valor.replace(",", ".")) * 1000)}</span>
                              </div>
                            ))}
                            {/* Nos debe details */}
                            {t.nosDebe.filter((e) => e.valor).map((e, i) => (
                              <div key={i} className="flex justify-between pl-3 text-muted-foreground/70">
                                <span>{e.descripcion || "—"}</span>
                                <span>{formatCurrency(parseFloat(e.valor.replace(",", ".")) * 1000)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="border-t border-border mt-3 pt-2 flex justify-between">
                            <span className="text-xs font-bold text-foreground">Total</span>
                            <span className={`text-sm font-bold ${t.calc.total >= 0 ? "text-primary" : "text-destructive"}`}>
                              {formatCurrency(t.calc.total)}
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
      </div>
    </Layout>
  );
}
