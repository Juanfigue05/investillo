import { useState, useMemo, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useGetTrabajadores } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Calculator, Plus, Trash2, ChevronDown, ChevronUp, Save, CheckCircle, Pencil } from "lucide-react";
import { encolarOperacion } from "@/lib/offline-db";
import { toast } from "@/hooks/use-toast";
import { CalculadoraCierre } from "@/components/CalculadoraCierre";
import { Calculator as CalcIcon } from "lucide-react";

// ---------- types ----------
interface ConceptoEntrada {
  descripcion: string;
  valor: string; // raw miles input e.g. "55" = 55000
}

interface CierreTrabajador {
  id: string;
  trabajadorId: number | null;
  nombre: string;
  moEntradas: string[];   // 10 rows, miles shorthand
  seguro: string;         // miles shorthand e.g. "30" = 30000
  leDamos: ConceptoEntrada[];
  nosDebe: ConceptoEntrada[];
  expandido: boolean;
}

// ---------- helpers ----------
const roundUp1000 = (n: number) => Math.ceil(n / 1000) * 1000;
/** Parse a "miles" shorthand: "55" → 55000, "45.5" → 45500, "" → 0 */
const parseMiles = (raw: string): number => {
  if (!raw.trim()) return 0;
  const n = parseFloat(raw.replace(",", "."));
  return isNaN(n) ? 0 : n * 1000;
};

const emptyConceptos = (): ConceptoEntrada[] =>
  Array.from({ length: 3 }, () => ({ descripcion: "", valor: "" }));
const emptyMO = (): string[] => Array.from({ length: 10 }, () => "");

const newTrabajador = (nombre = "", trabajadorId: number | null = null): CierreTrabajador => ({
  id: `${Date.now()}-${Math.random()}`,
  trabajadorId,
  nombre,
  moEntradas: emptyMO(),
  seguro: "30",
  leDamos: emptyConceptos(),
  nosDebe: emptyConceptos(),
  expandido: true,
});

const sumaConceptos = (arr: ConceptoEntrada[]) =>
  arr.reduce((s, e) => s + parseMiles(e.valor), 0);

function calcTrabajador(t: CierreTrabajador) {
  const mo = t.moEntradas.reduce((s, v) => s + parseMiles(v), 0);
  const descuento = mo > 0 ? roundUp1000(mo * 0.3) : 0;
  const seguro = parseMiles(t.seguro);
  const leDamos = sumaConceptos(t.leDamos);
  const nosDebe = sumaConceptos(t.nosDebe);
  const total = mo - descuento - seguro + leDamos - nosDebe;
  return { mo, descuento, seguro, leDamos, nosDebe, total };
}

// ---------- sub-components ----------
function MilesInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        placeholder={placeholder ?? "0"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none text-foreground placeholder:text-muted-foreground/50 text-right pr-6 ${className}`}
      />
      {value && parseMiles(value) > 0 && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground pointer-events-none">
          k
        </span>
      )}
    </div>
  );
}

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
              className="flex-1 px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none text-foreground placeholder:text-muted-foreground/50"
            />
            <MilesInput
              value={e.valor}
              onChange={(v) => onChange(idx, "valor", v)}
              placeholder="0"
              className="w-24"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- API helpers ----------
const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");

async function guardarCierre(fecha: string, datos: unknown, totalPagar: number) {
  const res = await fetch(`${API}/cierre-diario`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fecha, datos, totalPagar }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ---------- helpers: restore from snapshot ----------
function snapshotToItem(snap: TrabajadorSnapshot): CierreTrabajador {
  // Ensure arrays have the expected lengths
  const moEntradas = Array.from({ length: 10 }, (_, i) => snap.moEntradas?.[i] ?? "");
  const emptyC = (): ConceptoEntrada[] => Array.from({ length: 3 }, () => ({ descripcion: "", valor: "" }));
  const leDamos = snap.leDamos
    ? snap.leDamos.slice(0, 3).concat(emptyC().slice(snap.leDamos.length))
    : emptyC();
  const nosDebe = snap.nosDebe
    ? snap.nosDebe.slice(0, 3).concat(emptyC().slice(snap.nosDebe.length))
    : emptyC();
  return {
    id: snap.id ?? `${Date.now()}-${Math.random()}`,
    trabajadorId: snap.trabajadorId ?? null,   // ← agregar esta línea
    nombre: snap.nombre ?? "",
    moEntradas,
    seguro: snap.seguro ?? "30",
    leDamos,
    nosDebe,
    expandido: true,
  };
}

interface TrabajadorSnapshot {
  id: string;
  trabajadorId?: number | null;   // ← agregar esta línea
  nombre: string;
  moEntradas: string[];
  seguro: string;
  leDamos: { descripcion: string; valor: string }[];
  nosDebe: { descripcion: string; valor: string }[];
  calc?: unknown;
}

// ---------- main ----------
export default function CierreDiario() {
  const { data: trabajadores } = useGetTrabajadores();
  const [calcCierreOpen, setCalcCierreOpen] = useState(false); 
   
  const fechaHoy = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD
  const hoyLabel = new Date().toLocaleDateString("es-CO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const hoyStr = hoyLabel.charAt(0).toUpperCase() + hoyLabel.slice(1);

  const [items, setItems] = useState<CierreTrabajador[]>([]);
  const [showSelect, setShowSelect] = useState(false);
  const [nombreLibre, setNombreLibre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  // Edit mode: fecha being edited (null = new cierre for today)
  const [editFecha, setEditFecha] = useState<string | null>(null);

  // On mount, check sessionStorage for a cierre to edit
  useEffect(() => {
    const raw = sessionStorage.getItem("editarCierre");
    if (!raw) return;
    sessionStorage.removeItem("editarCierre");
    try {
      const { fecha, datos } = JSON.parse(raw) as { fecha: string; datos: TrabajadorSnapshot[] };
      setEditFecha(fecha);
      setItems(datos.map(snapshotToItem));
    } catch {
      // ignore malformed data
    }
  }, []);

  const agregarDesdeLista = (id: number, nombre: string) => {
  setItems((prev) => [...prev, newTrabajador(nombre, id)]);
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

  const updateMO = (id: string, idx: number, val: string) =>
    setItems((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const arr = [...t.moEntradas];
        arr[idx] = val;
        return { ...t, moEntradas: arr };
      })
    );

  const updateConcepto = (
    id: string,
    tipo: "leDamos" | "nosDebe",
    idx: number,
    field: "descripcion" | "valor",
    val: string
  ) =>
    setItems((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const arr = [...t[tipo]];
        arr[idx] = { ...arr[idx], [field]: val };
        return { ...t, [tipo]: arr };
      })
    );

  const grandTotal = useMemo(
    () => items.reduce((s, t) => s + calcTrabajador(t).total, 0),
    [items]
  );

const handleGuardar = async () => {
  if (items.length === 0) return;
  setGuardando(true);
  setGuardadoOk(false);

  const datos = items.map((t) => {
    const calc = calcTrabajador(t);
    return { ...t, calc };
  });
  const fecha = editFecha ?? fechaHoy;

  try {
    await guardarCierre(fecha, datos, grandTotal);
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 3000);
  } catch (e) {
    // Si el error viene de la red (sin conexión), se guarda local; si es otro tipo de error, se avisa normal
    if (navigator.onLine) {
      alert("Error al guardar: " + e);
    } else {
      await encolarOperacion({ tipo: "cierre_diario", metodo: "POST", endpoint: "/cierre-diario", payload: { fecha, datos, totalPagar: grandTotal } });
      toast({ title: "Guardado sin conexión", description: "Este cierre diario se sincronizará automáticamente cuando vuelva internet." });
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 3000);
    }
  } finally {
    setGuardando(false);
  }
};

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
              {editFecha ? <Pencil className="w-6 h-6 text-amber-400" /> : <Calculator className="w-6 h-6 text-primary" />}
              {editFecha ? "Editar Cierre" : "Cierre Diario"}
            </h1>
            {editFecha ? (
              <>
                <p className="text-sm text-amber-400 font-medium mt-1">
                  Editando cierre del{" "}
                  {new Date(editFecha + "T12:00:00").toLocaleDateString("es-CO", {
                    weekday: "long", year: "numeric", month: "long", day: "numeric",
                  })}
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  Guardar sobrescribirá el cierre existente para esa fecha.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mt-1">{hoyStr}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  Todos los campos de precio se escriben en miles: 55 = $55.000 · 45.5 = $45.500
                </p>
              </>
            )}
          </div>
          <button onClick={() => setCalcCierreOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/80 transition-all border border-border text-sm">
          <CalcIcon className="w-4 h-4" /> Calculadora
          </button>
          <CalculadoraCierre open={calcCierreOpen} onClose={() => setCalcCierreOpen(false)} />
          <div className="flex gap-2 flex-wrap">
            {items.length > 0 && (
              <button
                onClick={handleGuardar}
                disabled={guardando}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-lg ${
                  guardadoOk
                    ? "bg-green-600 text-white"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border"
                }`}
              >
                {guardadoOk ? (
                  <><CheckCircle className="w-4 h-4" /> Guardado</>
                ) : (
                  <><Save className="w-4 h-4" /> {guardando ? "Guardando..." : "Guardar Cierre"}</>
                )}
              </button>
            )}
            <button
              onClick={() => setShowSelect((v) => !v)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-lg text-sm"
            >
              <Plus className="w-4 h-4" /> Agregar trabajador
            </button>
          </div>
        </div>

        {/* Worker selector */}
        {showSelect && (
          <div className="bg-card border border-border rounded-2xl p-4 shadow-lg space-y-3">
            <p className="text-sm font-medium text-foreground">Selecciona o escribe el nombre:</p>
            <div className="flex gap-2 flex-wrap">
              {trabajadores?.map((t) => (
                <button
                  key={t.id}
                  onClick={() => agregarDesdeLista(t.id, t.nombre)}
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

        {/* ===== 3-column grid of worker cards ===== */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((t) => {
            const { mo, descuento, seguro, leDamos, nosDebe, total } = calcTrabajador(t);
            const moSum = t.moEntradas.reduce((s, v) => s + parseMiles(v), 0);

            return (
              <div key={t.id} className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden flex flex-col">
                {/* Card header */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-muted/30 transition-colors"
                  onClick={() => updateItem(t.id, { expandido: !t.expandido })}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {t.expandido
                      ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                    <span className="font-semibold text-foreground truncate">{t.nombre || "Trabajador"}</span>
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
                          disabled={t.trabajadorId !== null}
                          className={`w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none text-foreground ${t.trabajadorId !== null ? "opacity-70 cursor-not-allowed" : ""}`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          Seguro <span className="text-[10px] text-muted-foreground/60">(en miles)</span>
                        </label>
                        <MilesInput
                          value={t.seguro}
                          onChange={(v) => updateItem(t.id, { seguro: v })}
                          className="!text-sm !px-3 !py-2 !pr-8"
                        />
                      </div>
                    </div>

                    {/* MO entries — 10 rows, single column */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          Manos de Obra{" "}
                          <span className="text-[10px] text-muted-foreground/60">(en miles)</span>
                        </label>
                        {moSum > 0 && (
                          <span className="text-xs font-bold text-primary">
                            Σ {formatCurrency(moSum)}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {t.moEntradas.map((v, idx) => (
                          <MilesInput
                            key={idx}
                            value={v}
                            onChange={(val) => updateMO(t.id, idx, val)}
                            placeholder={`MO ${idx + 1}`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Le damos / Nos debe */}
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

                    {/* Summary */}
                    <div className="bg-muted/50 border border-border rounded-xl p-3">
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total MO</span>
                          <span className="font-semibold">{formatCurrency(mo)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Desc. 30%
                            {mo > 0 && mo * 0.3 !== descuento && (
                              <span className="ml-1 text-[10px] text-amber-400">≈</span>
                            )}
                          </span>
                          <span className="font-semibold text-destructive">− {formatCurrency(descuento)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Seguro</span>
                          <span className="font-semibold text-destructive">− {formatCurrency(seguro)}</span>
                        </div>
                        {leDamos > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Le damos</span>
                            <span className="font-semibold text-green-400">+ {formatCurrency(leDamos)}</span>
                          </div>
                        )}
                        {nosDebe > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Nos debe</span>
                            <span className="font-semibold text-destructive">− {formatCurrency(nosDebe)}</span>
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
