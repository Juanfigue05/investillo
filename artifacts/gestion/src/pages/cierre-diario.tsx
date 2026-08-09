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
  totalMO: string;
  seguro: string;
  leDamos: ConceptoEntrada[];
  nosDebe: ConceptoEntrada[];
  expandido: boolean;
}

// ---------- helpers ----------
const roundUp1000 = (n: number) => Math.ceil(n / 1000) * 1000;

const emptyEntradas = (): ConceptoEntrada[] => [
  { descripcion: "", valor: "" },
  { descripcion: "", valor: "" },
  { descripcion: "", valor: "" },
];

const newTrabajador = (nombre = ""): CierreTrabajador => ({
  id: `${Date.now()}-${Math.random()}`,
  nombre,
  totalMO: "",
  seguro: "30000",
  leDamos: emptyEntradas(),
  nosDebe: emptyEntradas(),
  expandido: true,
});

const sumaEntradas = (arr: ConceptoEntrada[]) =>
  arr.reduce((s, e) => s + (parseFloat(e.valor) || 0), 0);

function calcTrabajador(t: CierreTrabajador) {
  const mo = parseFloat(t.totalMO) || 0;
  const descuento = roundUp1000(mo * 0.3);
  const seguro = parseFloat(t.seguro) || 0;
  const leDamos = sumaEntradas(t.leDamos);
  const nosDebe = sumaEntradas(t.nosDebe);
  const total = mo - descuento - seguro + leDamos - nosDebe;
  return { mo, descuento, seguro, leDamos, nosDebe, total };
}

// ---------- sub-components ----------
function EntradaRow({
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
              className="w-28 px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none text-foreground placeholder:text-muted-foreground text-right"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- main component ----------
export default function CierreDiario() {
  const { data: trabajadores } = useGetTrabajadores();

  const hoy = new Date().toLocaleDateString("es-CO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const hoyLabel = hoy.charAt(0).toUpperCase() + hoy.slice(1);

  const [items, setItems] = useState<CierreTrabajador[]>([]);
  const [showSelect, setShowSelect] = useState(false);
  const [nombreLibre, setNombreLibre] = useState("");

  // Add worker from list
  const agregarDesdeLista = (nombre: string) => {
    setItems((prev) => [...prev, newTrabajador(nombre)]);
    setShowSelect(false);
  };

  // Add worker with free-text name
  const agregarLibre = () => {
    const n = nombreLibre.trim();
    if (!n) return;
    setItems((prev) => [...prev, newTrabajador(n)]);
    setNombreLibre("");
    setShowSelect(false);
  };

  // Generic field updater
  const updateItem = (id: string, patch: Partial<CierreTrabajador>) =>
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((t) => t.id !== id));

  const updateEntrada = (
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

  // Grand total
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

        {/* Worker selector dropdown */}
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

        {/* Worker cards */}
        {items.map((t) => {
          const { mo, descuento, seguro, leDamos, nosDebe, total } = calcTrabajador(t);
          return (
            <div key={t.id} className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
              {/* Card header */}
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer select-none hover:bg-muted/30 transition-colors"
                onClick={() => updateItem(t.id, { expandido: !t.expandido })}
              >
                <div className="flex items-center gap-3">
                  {t.expandido ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="font-semibold text-foreground">{t.nombre || "Trabajador"}</span>
                  {mo > 0 && (
                    <span className="text-xs text-muted-foreground">
                      MO: {formatCurrency(mo)} → Descuento: {formatCurrency(descuento)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {mo > 0 && (
                    <span className={`text-sm font-bold ${total >= 0 ? "text-primary" : "text-destructive"}`}>
                      Total: {formatCurrency(total)}
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
                <div className="px-5 pb-5 space-y-5 border-t border-border pt-4">
                  {/* Name + MO + Seguro row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        Total Mano de Obra
                      </label>
                      <input
                        type="number"
                        placeholder="0"
                        value={t.totalMO}
                        onChange={(e) => updateItem(t.id, { totalMO: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        Seguro (deducción fija)
                      </label>
                      <input
                        type="number"
                        value={t.seguro}
                        onChange={(e) => updateItem(t.id, { seguro: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none text-foreground"
                      />
                    </div>
                  </div>

                  {/* Le damos / Nos debe side by side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <EntradaRow
                      label="➕ Le damos"
                      entries={t.leDamos}
                      color="text-green-400"
                      onChange={(idx, field, val) =>
                        updateEntrada(t.id, "leDamos", idx, field, val)
                      }
                    />
                    <EntradaRow
                      label="➖ Nos debe"
                      entries={t.nosDebe}
                      color="text-destructive"
                      onChange={(idx, field, val) =>
                        updateEntrada(t.id, "nosDebe", idx, field, val)
                      }
                    />
                  </div>

                  {/* Summary box */}
                  <div className="bg-muted/50 border border-border rounded-xl p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Total MO</p>
                        <p className="font-semibold text-foreground">{formatCurrency(mo)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Descuento 30%
                          {mo > 0 && mo * 0.3 !== descuento && (
                            <span className="ml-1 text-[10px] text-amber-400">
                              (aprox. a {formatCurrency(descuento)})
                            </span>
                          )}
                        </p>
                        <p className="font-semibold text-destructive">− {formatCurrency(descuento)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Seguro</p>
                        <p className="font-semibold text-destructive">− {formatCurrency(seguro)}</p>
                      </div>
                      {leDamos > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground">Le damos</p>
                          <p className="font-semibold text-green-400">+ {formatCurrency(leDamos)}</p>
                        </div>
                      )}
                      {nosDebe > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground">Nos debe</p>
                          <p className="font-semibold text-destructive">− {formatCurrency(nosDebe)}</p>
                        </div>
                      )}
                      <div className="sm:col-start-3">
                        <p className="text-xs text-muted-foreground font-bold">Total a cuadrar</p>
                        <p className={`text-lg font-bold ${total >= 0 ? "text-primary" : "text-destructive"}`}>
                          {formatCurrency(total)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Grand total footer */}
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
