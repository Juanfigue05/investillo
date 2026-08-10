import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { useGetTrabajadores } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Calculator, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";

// ---------- types ----------
interface ConceptoEntrada {
  descripcion: string;
  valor: string;
}

interface CierreTrabajador {
  id: string;
  nombre: string;
  /** 10 raw MO input values (typed in thousands shorthand, e.g. "55" = 55000) */
  moEntradas: string[];
  seguro: string;
  leDamos: ConceptoEntrada[];
  nosDebe: ConceptoEntrada[];
  expandido: boolean;
}

// ---------- helpers ----------
const roundUp1000 = (n: number) => Math.ceil(n / 1000) * 1000;

const emptyConceptos = (): ConceptoEntrada[] => Array.from({ length: 3 }, () => ({ descripcion: "", valor: "" }));
const emptyMO = (): string[] => Array.from({ length: 10 }, () => "");

const newTrabajador = (nombre = ""): CierreTrabajador => ({
  id: `${Date.now()}-${Math.random()}`,
  nombre,
  moEntradas: emptyMO(),
  seguro: "30000",
  leDamos: emptyConceptos(),
  nosDebe: emptyConceptos(),
  expandido: true,
});

/**
 * Parse a MO shorthand value:
 *   "55"   → 55_000
 *   "45.5" → 45_500
 *   ""     → 0
 * Rule: multiply raw input by 1000 always (user types in thousands).
 */
const parseMO = (raw: string): number => {
  if (!raw.trim()) return 0;
  const n = parseFloat(raw.replace(",", "."));
  return isNaN(n) ? 0 : n * 1000;
};

const sumaConceptos = (arr: ConceptoEntrada[]) =>
  arr.reduce((s, e) => s + (parseFloat(e.valor) || 0), 0);

function calcTrabajador(t: CierreTrabajador) {
  const mo = t.moEntradas.reduce((s, v) => s + parseMO(v), 0);
  const descuento = mo > 0 ? roundUp1000(mo * 0.3) : 0;
  const seguro = parseFloat(t.seguro) || 0;
  const leDamos = sumaConceptos(t.leDamos);
  const nosDebe = sumaConceptos(t.nosDebe);
  const total = mo - descuento - seguro + leDamos - nosDebe;
  return { mo, descuento, seguro, leDamos, nosDebe, total };
}

// ---------- sub-components ----------
function ConceptoRows({
  label,
  entries,
  color,
  onChange,
}: {
  label: string;
  entries: ConceptoEntrada[];
  color: string;
  onChange: (idx: number, field: "descripcion" | "valor", val: string) => void;
}) {
  return (
    <div>
      <p className={`text-xs font-semibold mb-1.5 ${color}`}>{label}</p>
      <div className="space-y-1.5">
        {entries.map((e, idx) => (
          <div key={idx} className="flex gap-2">
            <input
              type="text"
              placeholder="Concepto..."
              value={e.descripcion}
              onChange={(ev) => onChange(idx, "descripcion", ev.target.value)}
              className="flex-1 px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none text-foreground placeholder:text-muted-foreground"
            />
            <input
              type="number"
              placeholder="$ 0"
              value={e.valor}
              onChange={(ev) => onChange(idx, "valor", ev.target.value)}
              className="w-28 px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none text-foreground text-right"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- main ----------
export default function CierreDiario() {
  const { data: trabajadores } = useGetTrabajadores();

  const hoy = new Date().toLocaleDateString("es-CO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const hoyLabel = hoy.charAt(0).toUpperCase() + hoy.slice(1);

  const [items, setItems] = useState<CierreTrabajador[]>([]);
  const [showSelect, setShowSelect] = useState(false);
  const [nombreLibre, setNombreLibre] = useState("");

  const agregarDesdeLista = (nombre: string) => {
    setItems((prev) => [...prev, newTrabajador(nombre)]);
    setShowSelect(false);
  };

  const agregarLibre = () => {
    const n = nombreLibre.trim();
    if (!n) return;
    setItems((prev) => [...prev, newTrabajador(n)]);
    setNombreLibre("");
    setShowSelect(false);
  };

  const updateItem = (id: string, patch: Partial<CierreTrabajador>) =>
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((t) => t.id !== id));

  const updateMO = (id: string, idx: number, val: string) => {
    setItems((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const arr = [...t.moEntradas];
        arr[idx] = val;
        return { ...t, moEntradas: arr };
      })
    );
  };

  const updateConcepto = (
    id: string,
    tipo: "leDamos" | "nosDebe",
    idx: number,
    field: "descripcion" | "valor",
    val: string
  ) => {
    setItems((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const arr = [...t[tipo]];
        arr[idx] = { ...arr[idx], [field]: val };
        return { ...t, [tipo]: arr };
      })
    );
  };

  const grandTotal = useMemo(
    () => items.reduce((s, t) => s + calcTrabajador(t).total, 0),
    [items]
  );

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
              <Calculator className="w-6 h-6 text-primary" /> Cierre Diario
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{hoyLabel}</p>
          </div>
          <button
            onClick={() => setShowSelect((v) => !v)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-lg text-sm"
          >
            <Plus className="w-4 h-4" /> Agregar trabajador
          </button>
        </div>

        {/* Worker selector */}
        {showSelect && (
          <div className="bg-card border border-border rounded-2xl p-4 shadow-lg space-y-3">
            <p className="text-sm font-medium text-foreground">Selecciona o escribe el nombre:</p>
            <div className="flex gap-2 flex-wrap">
              {trabajadores?.map((t) => (
                <button
                  key={t.id}
                  onClick={() => agregarDesdeLista(t.nombre)}
                  className="px-3 py-1.5 bg-muted hover:bg-primary/10 hover:text-primary border border-border rounded-lg text-sm transition-colors"
                >
                  {t.nombre}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nombre personalizado..."
                value={nombreLibre}
                onChange={(e) => setNombreLibre(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && agregarLibre()}
                className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none text-foreground"
              />
              <button
                onClick={agregarLibre}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Agregar
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {items.length === 0 && (
          <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
            <Calculator className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Agrega trabajadores para calcular el cierre del día.</p>
          </div>
        )}

        {/* ===== 2-column grid of worker cards ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {items.map((t) => {
            const { mo, descuento, seguro, leDamos, nosDebe, total } = calcTrabajador(t);
            const moSum = t.moEntradas.reduce((s, v) => s + parseMO(v), 0);

            return (
              <div key={t.id} className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden flex flex-col">
                {/* Card header */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-muted/30 transition-colors"
                  onClick={() => updateItem(t.id, { expandido: !t.expandido })}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {t.expandido ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                    <span className="font-semibold text-foreground truncate">{t.nombre || "Trabajador"}</span>
                    {mo > 0 && (
                      <span className="text-xs text-muted-foreground hidden sm:block whitespace-nowrap">
                        MO: {formatCurrency(mo)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {mo > 0 && (
                      <span className={`text-sm font-bold ${total >= 0 ? "text-primary" : "text-destructive"}`}>
                        {formatCurrency(total)}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeItem(t.id); }}
                      className="p-1.5 text-muted-foreground hover:text-destructive bg-muted rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Card body */}
                {t.expandido && (
                  <div className="px-4 pb-4 space-y-4 border-t border-border pt-4 flex-1">
                    {/* Name + Seguro */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Nombre</label>
                        <input
                          type="text"
                          value={t.nombre}
                          onChange={(e) => updateItem(t.id, { nombre: e.target.value })}
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none text-foreground"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Seguro (deducción)</label>
                        <input
                          type="number"
                          value={t.seguro}
                          onChange={(e) => updateItem(t.id, { seguro: e.target.value })}
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none text-foreground"
                        />
                      </div>
                    </div>

                    {/* MO entries — 10 rows in 2 columns */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          Manos de Obra{" "}
                          <span className="text-[10px] text-muted-foreground/60">(escribe en miles: 55 = $55.000)</span>
                        </label>
                        {moSum > 0 && (
                          <span className="text-xs font-bold text-primary">
                            Σ {formatCurrency(moSum)}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {t.moEntradas.map((v, idx) => (
                          <div key={idx} className="relative">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder={`MO ${idx + 1}`}
                              value={v}
                              onChange={(e) => updateMO(t.id, idx, e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none text-foreground placeholder:text-muted-foreground/50 text-right pr-8"
                            />
                            {v && parseMO(v) > 0 && (
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground pointer-events-none">
                                k
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Le damos / Nos debe */}
                    <div className="grid grid-cols-1 gap-4">
                      <ConceptoRows
                        label="➕ Le damos"
                        entries={t.leDamos}
                        color="text-green-400"
                        onChange={(idx, field, val) => updateConcepto(t.id, "leDamos", idx, field, val)}
                      />
                      <ConceptoRows
                        label="➖ Nos debe"
                        entries={t.nosDebe}
                        color="text-destructive"
                        onChange={(idx, field, val) => updateConcepto(t.id, "nosDebe", idx, field, val)}
                      />
                    </div>

                    {/* Summary */}
                    <div className="bg-muted/50 border border-border rounded-xl p-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Total MO</p>
                          <p className="font-semibold text-foreground">{formatCurrency(mo)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">
                            Desc. 30%
                            {mo > 0 && mo * 0.3 !== descuento && (
                              <span className="ml-1 text-[10px] text-amber-400">
                                (≈ {formatCurrency(descuento)})
                              </span>
                            )}
                          </p>
                          <p className="font-semibold text-destructive">− {formatCurrency(descuento)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Seguro</p>
                          <p className="font-semibold text-destructive">− {formatCurrency(seguro)}</p>
                        </div>
                        {leDamos > 0 && (
                          <div>
                            <p className="text-muted-foreground">Le damos</p>
                            <p className="font-semibold text-green-400">+ {formatCurrency(leDamos)}</p>
                          </div>
                        )}
                        {nosDebe > 0 && (
                          <div>
                            <p className="text-muted-foreground">Nos debe</p>
                            <p className="font-semibold text-destructive">− {formatCurrency(nosDebe)}</p>
                          </div>
                        )}
                      </div>
                      <div className="border-t border-border mt-2 pt-2 flex justify-between items-center">
                        <span className="text-xs font-bold text-foreground">Total a cuadrar</span>
                        <span className={`text-base font-bold ${total >= 0 ? "text-primary" : "text-destructive"}`}>
                          {formatCurrency(total)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Grand total */}
        {items.length > 1 && (
          <div className="bg-card border border-primary/30 rounded-2xl px-6 py-4 flex justify-between items-center shadow-lg">
            <span className="text-sm font-medium text-muted-foreground">
              Total a pagar ({items.length} trabajadores)
            </span>
            <span className="text-xl font-bold text-primary">{formatCurrency(grandTotal)}</span>
          </div>
        )}
      </div>
    </Layout>
  );
}
