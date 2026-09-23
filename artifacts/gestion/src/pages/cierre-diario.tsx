import { useState, useMemo, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useGetTrabajadores } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Calculator, Plus, Trash2, ChevronDown, ChevronUp, Save, CheckCircle, Pencil, Users, X } from "lucide-react";
import { encolarOperacion } from "@/lib/offline-db";
import { toast } from "@/hooks/use-toast";
import { CalculadoraCierre } from "@/components/CalculadoraCierre";
import { Calculator as CalcIcon } from "lucide-react";
import { fechaHoyColombia, fechaColombia } from "@/lib/utils";

// ---------- types ----------
interface ConceptoEntrada {
  descripcion: string;
  valor: string;
}

interface CierreTrabajador {
  id: string;
  trabajadorId: number | null;
  nombre: string;
  moEntradas: string[];
  seguro: string;
  leDamos: ConceptoEntrada[];
  nosDebe: ConceptoEntrada[];
  expandido: boolean;
}

interface GrupoTrabajoDia {
  id: string;
  trabajadorIds: number[];
  moEntradas: string[]; // varias manos de obra, en miles — se suman todas
}

interface GrupoDefault {
  id: number;
  trabajadorIds: number[];
  nombres: string[];
}

// ---------- helpers ----------
const roundUp1000 = (n: number) => Math.ceil(n / 1000) * 1000;
const parseMiles = (raw: string): number => {
  if (!raw.trim()) return 0;
  const n = parseFloat(raw.replace(",", "."));
  return isNaN(n) ? 0 : n * 1000;
};

const emptyConceptos = (): ConceptoEntrada[] =>
  Array.from({ length: 3 }, () => ({ descripcion: "", valor: "" }));
const emptyMO = (): string[] => Array.from({ length: 20 }, () => "");
const normalizarMO = (entries?: string[]): string[] => Array.from({ length: 20 }, (_, i) => entries?.[i] ?? "");

const normalizarConceptos = (entries?: ConceptoEntrada[]): ConceptoEntrada[] => {
  const valores = entries?.map((entry) => ({ descripcion: entry.descripcion ?? "", valor: entry.valor ?? "" })) ?? [];
  return valores.length >= 3 ? valores : valores.concat(emptyConceptos().slice(valores.length));
};

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

/** Cuánto le corresponde a un trabajador por los grupos de "trabajo en compañía" del día */
function shareDeGrupos(trabajadorId: number | null, grupos: GrupoTrabajoDia[]): number {
  if (!trabajadorId) return 0;
  return grupos
    .filter((g) => g.trabajadorIds.includes(trabajadorId))
    .reduce((s, g) => {
      const valorTotal = g.moEntradas.reduce((sum, v) => sum + parseMiles(v), 0);
      const n = g.trabajadorIds.length || 1;
      return s + valorTotal / n;
    }, 0);
}

function calcTrabajador(t: CierreTrabajador, grupos: GrupoTrabajoDia[], trabajadores: any[]) {
  const moPropia = t.moEntradas.reduce((s, v) => s + parseMiles(v), 0);
  const moGrupo = shareDeGrupos(t.trabajadorId, grupos);
  const mo = moPropia + moGrupo;

  const trabInfo = trabajadores.find((w) => w.id === t.trabajadorId);
  const aplicaDescuento30 = trabInfo ? Boolean(trabInfo.aplicaDescuento30) : true;
  const descuento = aplicaDescuento30 && mo > 0 ? roundUp1000(mo * 0.3) : 0;
  const aplicaSeguro = trabInfo ? Boolean(trabInfo.aplicaSeguro) : false;
  const seguro = aplicaSeguro ? parseMiles(t.seguro) : 0;

  const leDamos = sumaConceptos(t.leDamos);
  const nosDebe = sumaConceptos(t.nosDebe);
  const total = Math.max(0, mo - descuento - seguro + leDamos - nosDebe);
  return { mo, moPropia, moGrupo, descuento, aplicaDescuento30, seguro, aplicaSeguro, leDamos, nosDebe, total };
}

// ---------- sub-components ----------
function MilesInput({
  value, onChange, placeholder, className = "",
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className="relative">
      <input
        type="text" inputMode="decimal" placeholder={placeholder ?? "0"} value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none text-foreground placeholder:text-muted-foreground/50 text-right pr-6 ${className}`}
      />
      {value && parseMiles(value) > 0 && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground pointer-events-none">k</span>
      )}
    </div>
  );
}

function ConceptoRows({
  label, entries, color, onChange, onAdd,
}: { label: string; entries: ConceptoEntrada[]; color: string; onChange: (idx: number, field: "descripcion" | "valor", val: string) => void; onAdd: () => void }) {
  return (
    <div>
      <p className={`text-xs font-semibold mb-1.5 ${color}`}>{label}</p>
      <div className="space-y-1.5">
        {entries.map((e, idx) => (
          <div key={idx} className="flex gap-2">
            <input
              type="text" placeholder="Concepto..." value={e.descripcion}
              onChange={(ev) => onChange(idx, "descripcion", ev.target.value)}
              className="flex-1 px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none text-foreground placeholder:text-muted-foreground/50"
            />
            <MilesInput value={e.valor} onChange={(v) => onChange(idx, "valor", v)} placeholder="0" className="w-24" />
          </div>
        ))}
      </div>
      <button type="button" onClick={onAdd} className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80">
        <Plus className="w-3.5 h-3.5" /> Agregar fila
      </button>
    </div>
  );
}

// ---------- Panel de Grupos de Trabajo ----------
function GruposTrabajoPanel({
  open, onClose, trabajadores, gruposDefault, recargarGruposDefault,
  gruposDia, setGruposDia,
}: {
  open: boolean;
  onClose: () => void;
  trabajadores: { id: number; nombre: string }[];
  gruposDefault: GrupoDefault[];
  recargarGruposDefault: () => void;
  gruposDia: GrupoTrabajoDia[];
  setGruposDia: React.Dispatch<React.SetStateAction<GrupoTrabajoDia[]>>;
}) {
  const [nuevoGrupoIds, setNuevoGrupoIds] = useState<number[]>([]);
  const [nuevoEsPermanente, setNuevoEsPermanente] = useState(false);

  if (!open) return null;

  const toggleSeleccion = (id: number) => {
    setNuevoGrupoIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const crearGrupo = async () => {
    if (nuevoGrupoIds.length < 2) return;

    const idsNormalizados = [...new Set(nuevoGrupoIds)].sort((a, b) => a - b);
    const yaExisteHoy = gruposDia.some((grupo) => {
      const ids = [...new Set(grupo.trabajadorIds)].sort((a, b) => a - b);
      return ids.length === idsNormalizados.length && ids.every((id, index) => id === idsNormalizados[index]);
    });
    if (yaExisteHoy) {
      setNuevoGrupoIds([]);
      setNuevoEsPermanente(false);
      return;
    }

    if (nuevoEsPermanente) {
      const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");
      await fetch(`${API}/grupos-trabajo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trabajadorIds: idsNormalizados }),
      });
      recargarGruposDefault();
    }

    setGruposDia((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, trabajadorIds: idsNormalizados, moEntradas: emptyMO() }]);setNuevoGrupoIds([]);
    setNuevoEsPermanente(false);
  };

  const desactivarDefault = async (id: number) => {
    if (!confirm("¿Desactivar este grupo permanente? Desde mañana ya no se agregará solo.")) return;
    const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");
    await fetch(`${API}/grupos-trabajo/${id}/desactivar`, { method: "PATCH" });
    recargarGruposDefault();
  };

  const nombrePorId = (id: number) => trabajadores.find((t) => t.id === id)?.nombre || `Trabajador ${id}`;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-6 py-3.5 flex items-center justify-between z-10">
          <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> Grupos de trabajo (mano de obra en compañía)
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* ── Columna izquierda: Grupos de hoy ── */}
            <div>
              <h3 className="text-sm font-bold text-foreground mb-2">Grupos de hoy</h3>
              {gruposDia.length === 0 && <p className="text-sm text-muted-foreground">Ningún grupo armado todavía para este día.</p>}
              <div className="space-y-2">
                {gruposDia.map((g) => {
                  const totalGrupo = g.moEntradas.reduce((s, v) => s + parseMiles(v), 0);
                  return (
                    <div key={g.id} className="bg-background border border-border rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-wrap gap-1">
                          {g.trabajadorIds.map((id) => (
                            <span key={id} className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded-md">{nombrePorId(id)}</span>
                          ))}
                        </div>
                        <button onClick={() => setGruposDia((prev) => prev.filter((x) => x.id !== g.id))} className="p-1.5 text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        {g.moEntradas.map((v, idx) => (
                          <MilesInput
                            key={idx}
                            value={v}
                            onChange={(val) => setGruposDia((prev) => prev.map((x) => {
                              if (x.id !== g.id) return x;
                              const arr = [...x.moEntradas];
                              arr[idx] = val;
                              return { ...x, moEntradas: arr };
                            }))}
                            placeholder={`MO ${idx + 1}`}
                          />
                        ))}
                      </div>

                      <div className="flex justify-between text-xs pt-1 border-t border-border">
                        <span className="text-muted-foreground">Total: <span className="font-bold text-foreground">{formatCurrency(totalGrupo)}</span></span>
                        <span className="text-muted-foreground">c/u: <span className="font-bold text-primary">{formatCurrency(totalGrupo / (g.trabajadorIds.length || 1))}</span></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Columna derecha: Armar grupo ── */}
            <div className="bg-background border border-border rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Armar grupo</p>
              <div className="flex flex-wrap gap-2">
                {trabajadores.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => toggleSeleccion(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${nuevoGrupoIds.includes(t.id) ? "bg-primary/20 border-primary text-primary" : "bg-muted border-border text-muted-foreground hover:border-primary/50"}`}
                  >
                    {t.nombre}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={nuevoEsPermanente} onChange={(e) => setNuevoEsPermanente(e.target.checked)} className="accent-primary" />
                Dejarlo activo todos los días (hasta que yo lo desactive)
              </label>
              <button onClick={crearGrupo} disabled={nuevoGrupoIds.length < 2} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 disabled:opacity-40 text-sm">
                <Plus className="w-4 h-4" /> Agregar a hoy
              </button>
            </div>
          </div>

          {/* ── Abajo, ancho completo: Grupos permanentes ── */}
          <div>
            <h3 className="text-sm font-bold text-foreground mb-2">Grupos permanentes activos</h3>
            {gruposDefault.length === 0 && <p className="text-sm text-muted-foreground">No hay ninguno activo.</p>}
            <div className="space-y-2">
              {gruposDefault.map((g) => (
                <div key={g.id} className="flex items-center justify-between bg-background border border-border rounded-xl p-3">
                  <div className="flex flex-wrap gap-1">
                    {g.nombres.map((n) => <span key={n} className="text-xs font-medium bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-md">{n}</span>)}
                  </div>
                  <button onClick={() => desactivarDefault(g.id)} className="text-xs text-destructive hover:underline">Desactivar</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- API helpers ----------
const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");
const CIERRE_ACTIVO_KEY = "investillo-cierre-activo";

async function guardarCierre(fecha: string, datos: unknown, totalPagar: number, editar: boolean) {
  const res = await fetch(`${API}/cierre-diario`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fecha, datos, totalPagar, editar }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ---------- helpers: restore from snapshot ----------
function snapshotToItem(snap: TrabajadorSnapshot): CierreTrabajador {
  const moEntradas = normalizarMO(snap.moEntradas);
  const leDamos = normalizarConceptos(snap.leDamos);
  const nosDebe = normalizarConceptos(snap.nosDebe);
  return {
    id: snap.id ?? `${Date.now()}-${Math.random()}`,
    trabajadorId: snap.trabajadorId ?? null,
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
  trabajadorId?: number | null;
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
  const [gruposPanelOpen, setGruposPanelOpen] = useState(false);
  const [gruposDefault, setGruposDefault] = useState<GrupoDefault[]>([]);
  const [gruposDia, setGruposDia] = useState<GrupoTrabajoDia[]>([]);

  const fechaHoy = fechaHoyColombia();
  const [fechaCierre, setFechaCierre] = useState(() => fechaCierreActiva(fechaHoy));
  const hoyLabel = new Date(fechaCierre + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const hoyStr = hoyLabel.charAt(0).toUpperCase() + hoyLabel.slice(1);

  const [items, setItems] = useState<CierreTrabajador[]>([]);
  const [showSelect, setShowSelect] = useState(false);
  const [nombreLibre, setNombreLibre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [editFecha, setEditFecha] = useState<string | null>(null);
  const [editado, setEditado] = useState(false);
  const [salidaPendiente, setSalidaPendiente] = useState<(() => void) | null>(null);
  const [cierreInicialCargado, setCierreInicialCargado] = useState(false);

  const solicitarSalida = (accion: () => void) => {
    if (editFecha && editado) setSalidaPendiente(() => accion);
    else accion();
  };

  useEffect(() => {
    if (!editFecha || !editado) return;
    const advertirRecarga = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", advertirRecarga);
    return () => window.removeEventListener("beforeunload", advertirRecarga);
  }, [editFecha, editado]);

  useEffect(() => {
    if (!editFecha || !editado) return;
    const interceptarNavegacion = (event: MouseEvent) => {
      const elemento = event.target as HTMLElement | null;
      const enlace = elemento?.closest("a[href]") as HTMLAnchorElement | null;
      if (!enlace || enlace.target === "_blank") return;
      const destino = new URL(enlace.href, window.location.href);
      if (destino.pathname === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      solicitarSalida(() => { window.location.href = enlace.href; });
    };
    document.addEventListener("click", interceptarNavegacion, true);
    return () => document.removeEventListener("click", interceptarNavegacion, true);
  }, [editFecha, editado]);

  const cargarGruposDefault = async () => {
    const res = await fetch(`${API}/grupos-trabajo`);
    setGruposDefault(await res.json());
  };

  useEffect(() => { cargarGruposDefault(); }, []);

  // Al cargar un cierre NUEVO (no al editar uno viejo), autocompleta con los grupos permanentes
  useEffect(() => {
    if (editFecha) return; // si estás editando un cierre guardado, no se autocompleta
    if (gruposDefault.length === 0) return;
    setGruposDia((prev) => {
      if (prev.length > 0) return prev; // no duplicar si el usuario ya armó algo
      return gruposDefault.map((g) => ({
        id: `${Date.now()}-${g.id}-${Math.random()}`,
        trabajadorIds: g.trabajadorIds,
        moEntradas: emptyMO(),
      }));
    });
  }, [gruposDefault, editFecha]);

  useEffect(() => {
    if (editFecha === fechaCierre) return;
    const raw = sessionStorage.getItem("editarCierre");
    const cargarDatos = (fecha: string, datos: TrabajadorSnapshot[] | { trabajadores: TrabajadorSnapshot[]; gruposTrabajo?: GrupoTrabajoDia[] }) => {
      setEditFecha(fecha);
      setFechaCierre(fecha);
      const trabajadoresGuardados = Array.isArray(datos) ? datos : datos.trabajadores;
      const grupos = Array.isArray(datos) ? [] : (datos.gruposTrabajo || []);
      setItems(trabajadoresGuardados.map(snapshotToItem));
      setGruposDia(grupos.map((grupo) => ({ ...grupo, moEntradas: normalizarMO(grupo.moEntradas) })));
    };

    if (raw) {
      sessionStorage.removeItem("editarCierre");
      try {
        const parsed = JSON.parse(raw) as { fecha: string; datos: TrabajadorSnapshot[] | { trabajadores: TrabajadorSnapshot[]; gruposTrabajo?: GrupoTrabajoDia[] } };
        cargarDatos(parsed.fecha, parsed.datos);
      } catch {
        // ignore malformed data
      }
      setCierreInicialCargado(true);
      return;
    }

    fetch(`${API}/cierre-diario/borrador?fecha=${fechaCierre}`)
      .then((res) => res.ok ? res.json() : null)
      .then((borrador) => {
        if (borrador?.datos) {
          const datos = borrador.datos as { trabajadores: TrabajadorSnapshot[]; gruposTrabajo?: GrupoTrabajoDia[] };
          setItems((datos.trabajadores || []).map(snapshotToItem));
          setGruposDia((datos.gruposTrabajo || []).map((grupo) => ({ ...grupo, moEntradas: normalizarMO(grupo.moEntradas) })));
          setCierreInicialCargado(true);
          return;
        }
        return fetch(`${API}/cierre-diario/por-fecha?fecha=${fechaCierre}`)
          .then((res) => res.ok ? res.json() : null)
          .then((cierre) => {
            if (cierre?.datos) cargarDatos(cierre.fecha, cierre.datos);
            setCierreInicialCargado(true);
          });
      })
      .catch(() => setCierreInicialCargado(true));
  }, [editFecha, fechaCierre]);

  useEffect(() => {
    if (!cierreInicialCargado || editFecha || items.length === 0) return;
    const datos = { trabajadores: items, gruposTrabajo: gruposDia };
    const timer = window.setTimeout(() => {
      guardarBorrador(fechaCierre, datos).catch(() => undefined);
      try { sessionStorage.setItem(CIERRE_ACTIVO_KEY, fechaCierre); } catch { /* almacenamiento de sesión no es la fuente de datos */ }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [cierreInicialCargado, editFecha, fechaCierre, gruposDia, items]);

  useEffect(() => {
    if (!cierreInicialCargado || editFecha || items.length > 0 || !trabajadores) return;
    const activos = trabajadores.filter((trabajador) => trabajador.activo);
    if (activos.length > 0) {
      setItems(activos.map((trabajador) => newTrabajador(trabajador.nombre, trabajador.id)));
    }
  }, [editFecha, items.length, trabajadores]);

  const agregarDesdeLista = (id: number, nombre: string) => {
    solicitarSalida(() => {
      if (editFecha) setEditado(true);
      setItems((prev) => [...prev, newTrabajador(nombre, id)]);
      setShowSelect(false);
    });
  };
  const agregarLibre = () => {
    const n = nombreLibre.trim();
    if (!n) return;
    solicitarSalida(() => {
      if (editFecha) setEditado(true);
      setItems((prev) => [...prev, newTrabajador(n)]);
      setNombreLibre("");
      setShowSelect(false);
    });
  };

  const cambiarFecha = (fecha: string) => {
    setFechaCierre(fecha);
    setEditFecha(null);
    setEditado(false);
    setCierreInicialCargado(false);
    setItems([]);
    setGruposDia([]);
    setGuardadoOk(false);
  };

  const updateItem = (id: string, patch: Partial<CierreTrabajador>) => {
    if (editFecha && Object.keys(patch).some((key) => key !== "expandido")) setEditado(true);
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };
  const removeItem = (id: string) => { solicitarSalida(() => { if (editFecha) setEditado(true); setItems((prev) => prev.filter((t) => t.id !== id)); }); };

  const updateMO = (id: string, idx: number, val: string) => {
    if (editFecha) setEditado(true);
    setItems((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      const arr = [...t.moEntradas];
      arr[idx] = val;
      return { ...t, moEntradas: arr };
    }));
  };

  const updateConcepto = (id: string, tipo: "leDamos" | "nosDebe", idx: number, field: "descripcion" | "valor", val: string) => {
    if (editFecha) setEditado(true);
    setItems((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      const arr = [...t[tipo]];
      arr[idx] = { ...arr[idx], [field]: val };
      return { ...t, [tipo]: arr };
    }));
  };

  const agregarConcepto = (id: string, tipo: "leDamos" | "nosDebe") =>
    solicitarSalida(() => { if (editFecha) setEditado(true); setItems((prev) => prev.map((t) => t.id === id ? { ...t, [tipo]: [...t[tipo], { descripcion: "", valor: "" }] } : t)); });

  const grandTotal = useMemo(
    () => items.reduce((s, t, i) => s + calcTrabajador(t, gruposDia, trabajadores || []).total, 0),
    [items, gruposDia, trabajadores]
  );

  const handleGuardar = async () => {
    if (items.length === 0) return;
    setGuardando(true);
    setGuardadoOk(false);

    const datosTrabajadores = items.map((t) => {
      const calc = calcTrabajador(t, gruposDia, trabajadores || []);
      return { ...t, calc };
    });
    const datos = { trabajadores: datosTrabajadores, gruposTrabajo: gruposDia };
    const fecha = editFecha ?? fechaCierre;

    try {
      await guardarCierre(fecha, datos, grandTotal, Boolean(editFecha));
      setEditado(false);
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 3000);
    } catch (e) {
      if (navigator.onLine) {
        alert("Error al guardar: " + e);
      } else {
        await encolarOperacion({ tipo: "cierre_diario", metodo: "POST", endpoint: "/cierre-diario", payload: { fecha, datos, totalPagar: grandTotal } });
        setEditado(false);
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
                  {new Date(editFecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">Guardar sobrescribirá el cierre existente para esa fecha.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mt-1">{hoyStr}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">Todos los campos de precio se escriben en miles: 55 = $55.000 · 45.5 = $45.500</p>
              </>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <label className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-xl text-sm text-muted-foreground">
              Fecha del cierre
              <input
                type="date"
                value={fechaCierre}
                onChange={(e) => {
                  solicitarSalida(() => cambiarFecha(e.target.value));
                }}
                className="bg-background text-foreground border border-border px-2 py-1 rounded-lg text-sm disabled:opacity-60"
              />
            </label>
                        <button onClick={() => solicitarSalida(() => setGruposPanelOpen(true))} className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/80 transition-all border border-border text-sm">
              <Users className="w-4 h-4" /> Grupos de trabajo{gruposDia.length > 0 ? ` (${gruposDia.length})` : ""}
            </button>
            <button onClick={() => solicitarSalida(() => setCalcCierreOpen(true))} className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/80 transition-all border border-border text-sm">
              <CalcIcon className="w-4 h-4" /> Calculadora
            </button>
            {items.length > 0 && (
              <button
                onClick={handleGuardar}
                disabled={guardando}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-lg ${guardadoOk ? "bg-green-600 text-white" : "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border"}`}
              >
                {guardadoOk ? (<><CheckCircle className="w-4 h-4" /> Guardado</>) : (<><Save className="w-4 h-4" /> {guardando ? "Guardando..." : "Guardar Cierre"}</>)}
              </button>
            )}
            <button onClick={() => solicitarSalida(() => setShowSelect((v) => !v))} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-lg text-sm">
              <Plus className="w-4 h-4" /> Agregar trabajador
            </button>
          </div>
        </div>

        <CalculadoraCierre open={calcCierreOpen} onClose={() => setCalcCierreOpen(false)} />
        <GruposTrabajoPanel
          open={gruposPanelOpen}
          onClose={() => setGruposPanelOpen(false)}
          trabajadores={trabajadores || []}
          gruposDefault={gruposDefault}
          recargarGruposDefault={cargarGruposDefault}
          gruposDia={gruposDia}
          setGruposDia={setGruposDia}
        />

        {showSelect && (
          <div className="bg-card border border-border rounded-2xl p-4 shadow-lg space-y-3">
            <p className="text-sm font-medium text-foreground">Selecciona o escribe el nombre:</p>
            <div className="flex gap-2 flex-wrap">
              {trabajadores?.map((t) => (
                <button key={t.id} onClick={() => agregarDesdeLista(t.id, t.nombre)} className="px-3 py-1.5 bg-muted hover:bg-primary/10 hover:text-primary border border-border rounded-lg text-sm transition-colors">
                  {t.nombre}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text" placeholder="Nombre personalizado..." value={nombreLibre} onChange={(e) => setNombreLibre(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && agregarLibre()}
                className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none text-foreground"
              />
              <button onClick={agregarLibre} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">Agregar</button>
            </div>
          </div>
        )}

        {items.length === 0 && (
          <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
            <Calculator className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Agrega trabajadores para calcular el cierre del día.</p>
          </div>
        )}

        {salidaPendiente && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
              <h2 className="text-lg font-bold text-foreground">Cambios sin guardar</h2>
              <p className="mt-2 text-sm text-muted-foreground">Este cierre histórico tiene modificaciones. Debes guardar el cierre antes de continuar o puedes salir sin conservarlas.</p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setSalidaPendiente(null)} className="rounded-xl border border-border px-4 py-2 text-sm text-foreground hover:bg-muted">Seguir editando</button>
                <button type="button" onClick={() => { const accion = salidaPendiente; setSalidaPendiente(null); setEditado(false); accion(); }} className="rounded-xl bg-destructive px-4 py-2 text-sm text-destructive-foreground hover:bg-destructive/90">Salir sin guardar</button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((t) => {
            const { mo, moPropia, moGrupo, descuento, aplicaDescuento30, seguro, aplicaSeguro, leDamos, nosDebe, total } = calcTrabajador(t, gruposDia, trabajadores || []);

            return (
              <div key={t.id} className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden flex flex-col">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-muted/30 transition-colors"
                  onClick={() => updateItem(t.id, { expandido: !t.expandido })}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {t.expandido ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                    <span className="font-semibold text-foreground truncate">{t.nombre || "Trabajador"}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {mo > 0 && (
                      <span className={`text-sm font-bold ${total >= 0 ? "text-primary" : "text-destructive"}`}>{formatCurrency(total)}</span>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); removeItem(t.id); }} className="p-1.5 text-muted-foreground hover:text-destructive bg-muted rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {t.expandido && (
                  <div className="px-4 pb-4 space-y-4 border-t border-border pt-4 flex-1">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Nombre</label>
                        <input
                          type="text" value={t.nombre} onChange={(e) => updateItem(t.id, { nombre: e.target.value })}
                          disabled={t.trabajadorId !== null}
                          className={`w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none text-foreground ${t.trabajadorId !== null ? "opacity-70 cursor-not-allowed" : ""}`}
                        />
                      </div>
                      {calcTrabajador(t, gruposDia, trabajadores || []).aplicaSeguro && (
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Seguro <span className="text-[10px] text-muted-foreground/60">(en miles)</span></label>
                        <MilesInput value={t.seguro} onChange={(v) => updateItem(t.id, { seguro: v })} className="!text-sm !px-3 !py-2 !pr-8" />
                      </div>
                    )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Manos de Obra <span className="text-[10px] text-muted-foreground/60">(en miles)</span></label>
                        {moPropia > 0 && <span className="text-xs font-bold text-primary">Σ {formatCurrency(moPropia)}</span>}
                      </div>
                      <div className="space-y-1.5">
                        <div className="grid grid-cols-2 gap-1.5">
                        {t.moEntradas.map((v, idx) => (
                          <MilesInput key={idx} value={v} onChange={(val) => updateMO(t.id, idx, val)} placeholder={`MO ${idx + 1}`} />
                        ))}
                        </div>
                      </div>
                    </div>

                    {moGrupo > 0 && (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-2.5 flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        <p className="text-xs text-emerald-400">Trabajo en compañía: <span className="font-bold">{formatCurrency(moGrupo)}</span></p>
                      </div>
                    )}

                    <ConceptoRows label="➕ Le damos" entries={t.leDamos} color="text-green-400" onChange={(idx, field, val) => updateConcepto(t.id, "leDamos", idx, field, val)} onAdd={() => agregarConcepto(t.id, "leDamos")} />
                    <ConceptoRows label="➖ Nos debe" entries={t.nosDebe} color="text-destructive" onChange={(idx, field, val) => updateConcepto(t.id, "nosDebe", idx, field, val)} onAdd={() => agregarConcepto(t.id, "nosDebe")} />

                    <div className="bg-muted/50 border border-border rounded-xl p-3">
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between"><span className="text-muted-foreground">Total MO (propia + grupo)</span><span className="font-semibold">{formatCurrency(mo)}</span></div>
                        {aplicaDescuento30 && <div className="flex justify-between"><span className="text-muted-foreground">Desc. 30%</span><span className="font-semibold text-destructive">− {formatCurrency(descuento)}</span></div>}
                        {aplicaSeguro && <div className="flex justify-between"><span className="text-muted-foreground">Seguro</span><span className="font-semibold text-destructive">− {formatCurrency(seguro)}</span></div>}
                        {leDamos > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Le damos</span><span className="font-semibold text-green-400">+ {formatCurrency(leDamos)}</span></div>}
                        {nosDebe > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Nos debe</span><span className="font-semibold text-destructive">− {formatCurrency(nosDebe)}</span></div>}
                      </div>
                      <div className="border-t border-border mt-2 pt-2 flex justify-between items-center">
                        <span className="text-xs font-bold text-foreground">Total a cuadrar</span>
                        <span className={`text-base font-bold ${total >= 0 ? "text-primary" : "text-destructive"}`}>{formatCurrency(total)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {items.length > 1 && (
          <div className="bg-card border border-primary/30 rounded-2xl px-6 py-4 flex justify-between items-center shadow-lg">
            <span className="text-sm font-medium text-muted-foreground">Total a pagar ({items.length} trabajadores)</span>
            <span className="text-xl font-bold text-primary">{formatCurrency(grandTotal)}</span>
          </div>
        )}
      </div>
    </Layout>
  );
}

function fechaCierreActiva(fechaPorDefecto: string) {
  try {
    return sessionStorage.getItem(CIERRE_ACTIVO_KEY) || fechaPorDefecto;
  } catch {
    return fechaPorDefecto;
  }
}

async function guardarBorrador(fecha: string, datos: unknown) {
  const res = await fetch(`${API}/cierre-diario/borrador`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fecha, datos }),
  });
  if (!res.ok) throw new Error(await res.text());
}