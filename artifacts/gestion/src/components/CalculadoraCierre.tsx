import { useState, useMemo } from "react";
import { X, Calculator as CalcIcon, Plus, Trash2, Pencil, Check } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");

const DENOM_MONEDAS = [1000, 500, 200, 100, 50];
const DENOM_BILLETES = [100000, 50000, 20000, 10000, 5000, 2000];

function aproximarMiles(valor: number): number {
  return Math.ceil(valor / 1000) * 1000;
}

interface CampoManual {
  concepto: string;
  valor: string;
}

interface RemachadaRow {
  id: number;
  numeroBanda: string;
  valorJuego: number;
}

export function CalculadoraCierre({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [suma, setSuma] = useState<CampoManual[]>(Array.from({ length: 16 }, () => ({ concepto: "", valor: "" })));
  const [resta, setResta] = useState<CampoManual[]>(Array.from({ length: 4 }, () => ({ concepto: "", valor: "" })));
  const [manoObra, setManoObra] = useState("");

  const [monedas, setMonedas] = useState<Record<number, string>>({});
  const [billetes, setBilletes] = useState<Record<number, string>>({});

  const [remachadas, setRemachadas] = useState<RemachadaRow[]>([]);
  const [cargandoRemachadas, setCargandoRemachadas] = useState(false);
  const [editandoRemId, setEditandoRemId] = useState<number | null>(null);
  const [nuevaBanda, setNuevaBanda] = useState("");
  const [nuevoValor, setNuevoValor] = useState("");
  const [editValor, setEditValor] = useState("");

  const cargarRemachadas = async () => {
    setCargandoRemachadas(true);
    try {
      const res = await fetch(`${API}/remachadas`);
      setRemachadas(await res.json());
    } finally {
      setCargandoRemachadas(false);
    }
  };

  useState(() => { if (open && remachadas.length === 0) cargarRemachadas(); });

  const totalSuma = useMemo(() => suma.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0), [suma]);
  const totalResta = useMemo(() => resta.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0), [resta]);
  const manoObraNum = parseFloat(manoObra) || 0;
  const totalEsperado = totalSuma - totalResta - manoObraNum;

  const totalMonedas = useMemo(() => DENOM_MONEDAS.reduce((s, d) => s + d * (parseInt(monedas[d]) || 0), 0), [monedas]);
  const totalBilletes = useMemo(() => DENOM_BILLETES.reduce((s, d) => s + d * (parseInt(billetes[d]) || 0), 0), [billetes]);
  const totalContado = totalMonedas + totalBilletes;

  const diferencia = totalContado - totalEsperado;

  const agregarRemachada = async () => {
    if (!nuevaBanda.trim() || !nuevoValor) return;
    const res = await fetch(`${API}/remachadas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numeroBanda: nuevaBanda.trim(), valorJuego: parseFloat(nuevoValor) }),
    });
    const row = await res.json();
    setRemachadas((prev) => [...prev, row]);
    setNuevaBanda(""); setNuevoValor("");
  };

  const guardarEdicionRemachada = async (id: number) => {
    const res = await fetch(`${API}/remachadas/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valorJuego: parseFloat(editValor) }),
    });
    const row = await res.json();
    setRemachadas((prev) => prev.map((r) => (r.id === id ? row : r)));
    setEditandoRemId(null);
  };

  const eliminarRemachada = async (id: number) => {
    if (!confirm("¿Eliminar esta banda?")) return;
    await fetch(`${API}/remachadas/${id}`, { method: "DELETE" });
    setRemachadas((prev) => prev.filter((r) => r.id !== id));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
            <CalcIcon className="w-5 h-5 text-primary" /> Calculadora de Cierre
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* ── Sumas y restas ── */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-bold text-emerald-400 mb-2">Suma (16 conceptos)</h3>
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {suma.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <input placeholder={`Concepto ${i + 1}`} value={c.concepto}
                      onChange={(e) => setSuma((p) => p.map((x, j) => j === i ? { ...x, concepto: e.target.value } : x))}
                      className="flex-1 bg-background border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" />
                    <input type="number" placeholder="0" value={c.valor}
                      onChange={(e) => setSuma((p) => p.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))}
                      className="w-28 bg-background border border-emerald-500/40 px-2 py-1.5 rounded-lg text-xs text-right focus:ring-1 focus:ring-emerald-500 outline-none" />
                  </div>
                ))}
              </div>
              <p className="text-sm font-bold text-emerald-400 mt-2">Total suma: {formatCurrency(totalSuma)}</p>
            </div>

            <div>
              <h3 className="text-sm font-bold text-destructive mb-2">Resta — pagado externamente (4 conceptos)</h3>
              <div className="space-y-1.5">
                {resta.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <input placeholder={`Concepto ${i + 1}`} value={c.concepto}
                      onChange={(e) => setResta((p) => p.map((x, j) => j === i ? { ...x, concepto: e.target.value } : x))}
                      className="flex-1 bg-background border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" />
                    <input type="number" placeholder="0" value={c.valor}
                      onChange={(e) => setResta((p) => p.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))}
                      className="w-28 bg-background border border-destructive/40 px-2 py-1.5 rounded-lg text-xs text-right focus:ring-1 focus:ring-destructive outline-none" />
                  </div>
                ))}
              </div>
              <p className="text-sm font-bold text-destructive mt-2">Total resta: {formatCurrency(totalResta)}</p>

              <div className="mt-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
                <label className="block text-xs font-bold text-yellow-400 mb-1">Mano de obra (valor manual)</label>
                <input type="number" placeholder="0" value={manoObra} onChange={(e) => setManoObra(e.target.value)}
                  className="w-full bg-background border border-yellow-500/40 px-2 py-1.5 rounded-lg text-sm text-right focus:ring-1 focus:ring-yellow-500 outline-none" />
              </div>

              <div className="mt-4 bg-primary/10 border border-primary/30 rounded-xl p-3">
                <p className="text-xs text-muted-foreground">Total esperado (suma − resta − mano de obra)</p>
                <p className="text-lg font-bold text-primary">{formatCurrency(totalEsperado)}</p>
              </div>
            </div>
          </div>

          {/* ── Monedas y billetes ── */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-bold text-foreground mb-2">Monedas</h3>
              <table className="w-full text-xs">
                <thead><tr className="text-muted-foreground"><th className="text-left py-1">Cant.</th><th className="text-left py-1">Valor</th><th className="text-right py-1">Total</th></tr></thead>
                <tbody>
                  {DENOM_MONEDAS.map((d) => (
                    <tr key={d}>
                      <td className="py-1"><input type="number" min="0" value={monedas[d] || ""} onChange={(e) => setMonedas((p) => ({ ...p, [d]: e.target.value }))}
                        className="w-20 bg-background border border-border px-2 py-1 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" /></td>
                      <td className="py-1 text-muted-foreground">{formatCurrency(d)}</td>
                      <td className="py-1 text-right font-medium text-foreground">{formatCurrency(d * (parseInt(monedas[d]) || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-sm font-bold text-foreground mt-2">Total monedas: {formatCurrency(totalMonedas)}</p>
            </div>

            <div>
              <h3 className="text-sm font-bold text-foreground mb-2">Billetes</h3>
              <table className="w-full text-xs">
                <thead><tr className="text-muted-foreground"><th className="text-left py-1">Cant.</th><th className="text-left py-1">Valor</th><th className="text-right py-1">Total</th></tr></thead>
                <tbody>
                  {DENOM_BILLETES.map((d) => (
                    <tr key={d}>
                      <td className="py-1"><input type="number" min="0" value={billetes[d] || ""} onChange={(e) => setBilletes((p) => ({ ...p, [d]: e.target.value }))}
                        className="w-20 bg-background border border-border px-2 py-1 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" /></td>
                      <td className="py-1 text-muted-foreground">{formatCurrency(d)}</td>
                      <td className="py-1 text-right font-medium text-foreground">{formatCurrency(d * (parseInt(billetes[d]) || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-sm font-bold text-foreground mt-2">Total billetes: {formatCurrency(totalBilletes)}</p>
            </div>
          </div>

          {/* ── Cuadre ── */}
          <div className={`rounded-xl p-4 border ${diferencia === 0 ? "bg-emerald-500/10 border-emerald-500/30" : "bg-destructive/10 border-destructive/30"}`}>
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div><p className="text-xs text-muted-foreground">Total contado (monedas + billetes)</p><p className="font-bold text-foreground">{formatCurrency(totalContado)}</p></div>
              <div><p className="text-xs text-muted-foreground">Total esperado</p><p className="font-bold text-foreground">{formatCurrency(totalEsperado)}</p></div>
              <div>
                <p className="text-xs text-muted-foreground">Diferencia</p>
                <p className={`font-bold ${diferencia === 0 ? "text-emerald-400" : "text-destructive"}`}>
                  {diferencia === 0 ? "Cuadra ✓" : formatCurrency(diferencia)}
                </p>
              </div>
            </div>
          </div>

          {/* ── Remachadas ── */}
          <div>
            <h3 className="text-sm font-bold text-foreground mb-2">Consulta — Remachadas</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted text-muted-foreground">
                    <th className="px-2 py-2 text-left">Banda</th>
                    <th className="px-2 py-2 text-right">Juego (1)</th>
                    <th className="px-2 py-2 text-right">Medio juego (0.5)</th>
                    <th className="px-2 py-2 text-right">Una banda (0.25)</th>
                    <th className="px-2 py-2 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {remachadas.map((r) => (
                    <tr key={r.id}>
                      <td className="px-2 py-2 font-medium">{r.numeroBanda}</td>
                      <td className="px-2 py-2 text-right">
                        {editandoRemId === r.id ? (
                          <input type="number" value={editValor} onChange={(e) => setEditValor(e.target.value)}
                            className="w-24 bg-background border border-primary/50 px-2 py-1 rounded-lg text-xs text-right" />
                        ) : formatCurrency(r.valorJuego)}
                      </td>
                      <td className="px-2 py-2 text-right text-muted-foreground">{formatCurrency(aproximarMiles(r.valorJuego / 2))}</td>
                      <td className="px-2 py-2 text-right text-muted-foreground">{formatCurrency(aproximarMiles(r.valorJuego / 4))}</td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1 justify-end">
                          {editandoRemId === r.id ? (
                            <button onClick={() => guardarEdicionRemachada(r.id)} className="p-1 text-primary"><Check className="w-3.5 h-3.5" /></button>
                          ) : (
                            <button onClick={() => { setEditandoRemId(r.id); setEditValor(String(r.valorJuego)); }} className="p-1 text-muted-foreground hover:text-primary"><Pencil className="w-3.5 h-3.5" /></button>
                          )}
                          <button onClick={() => eliminarRemachada(r.id)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 mt-3">
              <input placeholder="Número de banda" value={nuevaBanda} onChange={(e) => setNuevaBanda(e.target.value)}
                className="w-40 bg-background border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" />
              <input type="number" placeholder="Valor juego completo" value={nuevoValor} onChange={(e) => setNuevoValor(e.target.value)}
                className="w-40 bg-background border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" />
              <button onClick={agregarRemachada} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90">
                <Plus className="w-3.5 h-3.5" /> Agregar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}