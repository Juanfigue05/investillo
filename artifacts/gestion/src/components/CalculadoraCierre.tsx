import { useState, useMemo, useEffect } from "react";
import { X, Calculator as CalcIcon } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const API = "/api";

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

export function CalculadoraCierre({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [suma, setSuma] = useState<CampoManual[]>(
    Array.from({ length: 16 }, () => ({ concepto: "", valor: "" })),
  );
  const [resta, setResta] = useState<CampoManual[]>(
    Array.from({ length: 4 }, () => ({ concepto: "", valor: "" })),
  );
  const [manoObra, setManoObra] = useState("");

  const [monedas, setMonedas] = useState<Record<number, string>>({});
  const [billetes, setBilletes] = useState<Record<number, string>>({});
  const [bolsa, setBolsa] = useState("");
  const [caja, setCaja] = useState("");

  // ── Remachadas: solo consulta (la administración vive en Inventario) ──
  const [remachadas, setRemachadas] = useState<RemachadaRow[]>([]);
  const [cargandoRemachadas, setCargandoRemachadas] = useState(false);
  const [bandaBuscada, setBandaBuscada] = useState("");

  const cargarRemachadas = async () => {
    setCargandoRemachadas(true);
    try {
      const res = await fetch(`${API}/remachadas`);
      setRemachadas(await res.json());
    } finally {
      setCargandoRemachadas(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    fetch(`${API}/conteo-monedas`)
      .then((r) => r.json())
      .then((d) => {
        setBolsa(String(d.bolsa || 0));
        setCaja(String(d.caja || 0));
      });
  }, [open]);

  const guardarConteoMonedas = async (
    nuevaBolsa: string,
    nuevaCaja: string,
  ) => {
    await fetch(`${API}/conteo-monedas`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bolsa: parseFloat(nuevaBolsa) || 0,
        caja: parseFloat(nuevaCaja) || 0,
      }),
    });
  };

  const totalBolsaCaja = (parseFloat(bolsa) || 0) + (parseFloat(caja) || 0);

  useEffect(() => {
    if (open && remachadas.length === 0) cargarRemachadas();
  }, [open]);

  // "resultadoBanda" depende de "remachadas" y "bandaBuscada" — por eso va DESPUÉS de que ambas ya existan arriba.
  const resultadoBanda = useMemo(
    () =>
      remachadas.find(
        (r) =>
          r.numeroBanda.toLowerCase() === bandaBuscada.trim().toLowerCase(),
      ) || null,
    [remachadas, bandaBuscada],
  );

  const totalSuma = useMemo(
    () => suma.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0),
    [suma],
  );
  const totalResta = useMemo(
    () => resta.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0),
    [resta],
  );
  const manoObraNum = parseFloat(manoObra) || 0;
  const totalEsperado = totalSuma - totalResta - manoObraNum;

  const totalMonedas = useMemo(
    () =>
      DENOM_MONEDAS.reduce((s, d) => s + d * (parseInt(monedas[d]) || 0), 0),
    [monedas],
  );
  const totalBilletes = useMemo(
    () =>
      DENOM_BILLETES.reduce((s, d) => s + d * (parseInt(billetes[d]) || 0), 0),
    [billetes],
  );
  const totalContado = totalMonedas + totalBilletes;

  const diferencia = totalContado - totalEsperado;

  if (!open) return null;

  return (
    <div
      className="bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 90,
      }}
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-[1600px] max-h-[94vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b border-border px-6 py-3.5 flex items-center justify-between z-10">
          <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
            <CalcIcon className="w-5 h-5 text-primary" /> Calculadora de Cierre
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* ── Fila principal: Suma | Resta+ManoObra+Esperado | Monedas | Billetes ── */}
          <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1.1fr_0.85fr_0.85fr] gap-6">
            {/* Suma */}
            <div>
              <h3 className="text-sm font-bold text-emerald-400 mb-2">
                Suma ({suma.length} conceptos)
              </h3>
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {suma.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      placeholder={`Concepto ${i + 1}`}
                      value={c.concepto}
                      onChange={(e) =>
                        setSuma((p) =>
                          p.map((x, j) =>
                            j === i ? { ...x, concepto: e.target.value } : x,
                          ),
                        )
                      }
                      className="flex-1 bg-background border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none"
                    />
                    <input
                      type="number"
                      placeholder="0"
                      value={c.valor}
                      onChange={(e) =>
                        setSuma((p) =>
                          p.map((x, j) =>
                            j === i ? { ...x, valor: e.target.value } : x,
                          ),
                        )
                      }
                      className="w-28 bg-background border border-emerald-500/40 px-2 py-1.5 rounded-lg text-xs text-right focus:ring-1 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                ))}
              </div>
              <p className="text-sm font-bold text-emerald-400 mt-2">
                Total suma: {formatCurrency(totalSuma)}
              </p>
            </div>

            {/* Resta + Mano de obra + Total esperado */}
            <div className="flex flex-col">
              <h3 className="text-sm font-bold text-destructive mb-2">
                Resta — pagado externamente ({resta.length} conceptos)
              </h3>
              <div className="space-y-1.5">
                {resta.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      placeholder={`Concepto ${i + 1}`}
                      value={c.concepto}
                      onChange={(e) =>
                        setResta((p) =>
                          p.map((x, j) =>
                            j === i ? { ...x, concepto: e.target.value } : x,
                          ),
                        )
                      }
                      className="flex-1 bg-background border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none"
                    />
                    <input
                      type="number"
                      placeholder="0"
                      value={c.valor}
                      onChange={(e) =>
                        setResta((p) =>
                          p.map((x, j) =>
                            j === i ? { ...x, valor: e.target.value } : x,
                          ),
                        )
                      }
                      className="w-28 bg-background border border-destructive/40 px-2 py-1.5 rounded-lg text-xs text-right focus:ring-1 focus:ring-destructive outline-none"
                    />
                  </div>
                ))}
              </div>
              <p className="text-sm font-bold text-destructive mt-2">
                Total resta: {formatCurrency(totalResta)}
              </p>

              <div className="mt-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
                <label className="block text-xs font-bold text-yellow-400 mb-1">
                  Mano de obra (valor manual)
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={manoObra}
                  onChange={(e) => setManoObra(e.target.value)}
                  className="w-full bg-background border border-yellow-500/40 px-2 py-1.5 rounded-lg text-sm text-right focus:ring-1 focus:ring-yellow-500 outline-none"
                />
              </div>

              <div className="mt-3 bg-primary/10 border border-primary/30 rounded-xl p-3">
                <p className="text-xs text-muted-foreground">
                  Total esperado (suma − resta − mano de obra)
                </p>
                <p className="text-lg font-bold text-primary">
                  {formatCurrency(totalEsperado)}
                </p>
              </div>
            </div>

            {/* Monedas */}
            <div>
              <h3 className="text-sm font-bold text-foreground mb-2">
                Monedas
              </h3>
              <table className="w-full text-xs border-separate border-spacing-y-1">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-medium pb-1">Cant.</th>
                    <th className="text-left font-medium pb-1">Valor</th>
                    <th className="text-right font-medium pb-1">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {DENOM_MONEDAS.map((d) => (
                    <tr key={d}>
                      <td className="pr-1.5">
                        <input
                          type="number"
                          min="0"
                          value={monedas[d] || ""}
                          onChange={(e) =>
                            setMonedas((p) => ({ ...p, [d]: e.target.value }))
                          }
                          className="w-16 bg-background border border-border px-1.5 py-1 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none"
                        />
                      </td>
                      <td className="text-muted-foreground whitespace-nowrap pr-1.5">
                        {formatCurrency(d)}
                      </td>
                      <td className="text-right font-medium text-foreground whitespace-nowrap">
                        {formatCurrency(d * (parseInt(monedas[d]) || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-sm font-bold text-foreground mt-2">
                Total monedas: {formatCurrency(totalMonedas)}
              </p>
            </div>

            {/* Billetes */}
            <div>
              <h3 className="text-sm font-bold text-foreground mb-2">
                Billetes
              </h3>
              <table className="w-full text-xs border-separate border-spacing-y-1">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-medium pb-1">Cant.</th>
                    <th className="text-left font-medium pb-1">Valor</th>
                    <th className="text-right font-medium pb-1">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {DENOM_BILLETES.map((d) => (
                    <tr key={d}>
                      <td className="pr-1.5">
                        <input
                          type="number"
                          min="0"
                          value={billetes[d] || ""}
                          onChange={(e) =>
                            setBilletes((p) => ({ ...p, [d]: e.target.value }))
                          }
                          className="w-16 bg-background border border-border px-1.5 py-1 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none"
                        />
                      </td>
                      <td className="text-muted-foreground whitespace-nowrap pr-1.5">
                        {formatCurrency(d)}
                      </td>
                      <td className="text-right font-medium text-foreground whitespace-nowrap">
                        {formatCurrency(d * (parseInt(billetes[d]) || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-sm font-bold text-foreground mt-2">
                Total billetes: {formatCurrency(totalBilletes)}
              </p>
            </div>
          </div>

          {/* ── Cuadre (semáforo de colores) ── */}
          {(() => {
            const esCero = diferencia === 0;
            const esPositiva = diferencia > 0;
            const estilos = esCero
              ? "bg-emerald-500/10 border-emerald-500/20"
              : esPositiva
                ? "bg-emerald-500/25 border-emerald-500/70"
                : "bg-destructive/10 border-destructive/30";
            const colorTexto = esCero
              ? "text-emerald-500/80"
              : esPositiva
                ? "text-emerald-400"
                : "text-destructive";
            const textoDiferencia = esCero
              ? "Cuadra ✓"
              : `${esPositiva ? "+" : "-"}${formatCurrency(Math.abs(diferencia))}`;

            return (
              <div className={`rounded-xl p-4 border ${estilos}`}>
                <div className="flex justify-between items-center flex-wrap gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Total contado (monedas + billetes)
                    </p>
                    <p className="font-bold text-foreground">
                      {formatCurrency(totalContado)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Total esperado
                    </p>
                    <p className="font-bold text-foreground">
                      {formatCurrency(totalEsperado)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Diferencia</p>
                    <p className={`font-bold text-lg ${colorTexto}`}>
                      {textoDiferencia}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6">
            {/* ── Remachadas ── */}
            <div>
              <h3 className="text-sm font-bold text-foreground mb-2">
                Consulta — Remachadas
              </h3>
              <div className="max-w-sm">
                <input
                  placeholder="Escribe el número de banda..."
                  value={bandaBuscada}
                  onChange={(e) => setBandaBuscada(e.target.value)}
                  className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              {cargandoRemachadas && (
                <p className="text-sm text-muted-foreground mt-3">
                  Cargando bandas...
                </p>
              )}

              {!cargandoRemachadas &&
                bandaBuscada.trim() &&
                (resultadoBanda ? (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-border max-w-2xl">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-muted text-muted-foreground">
                          <th className="px-3 py-2 text-left">Banda</th>
                          <th className="px-3 py-2 text-right">Juego (1)</th>
                          <th className="px-3 py-2 text-right">
                            Medio juego (0.5)
                          </th>
                          <th className="px-3 py-2 text-right">
                            Una banda (0.25)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="px-3 py-2 font-medium">
                            {resultadoBanda.numeroBanda}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-primary">
                            {formatCurrency(resultadoBanda.valorJuego)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {formatCurrency(
                              aproximarMiles(resultadoBanda.valorJuego * 0.5),
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {formatCurrency(
                              aproximarMiles(resultadoBanda.valorJuego * 0.25),
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mt-3">
                    No se encontró esa banda. Agrégala desde Inventario →
                    pestaña Remachadas.
                  </p>
                ))}
            </div>

            {/* ── Total Monedas (Bolsa/Caja) — persistente ── */}
            <div>
              <h3 className="text-sm font-bold text-foreground mb-2">
                Total Monedas
              </h3>
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="grid grid-cols-2 bg-sky-500/10 border-b border-border">
                  <div className="px-3 py-2 text-sm font-bold text-sky-400">
                    BOLSA
                  </div>
                  <input
                    type="number"
                    value={bolsa}
                    onChange={(e) => setBolsa(e.target.value)}
                    onBlur={() => guardarConteoMonedas(bolsa, caja)}
                    className="bg-background px-3 py-2 text-right text-sm font-bold outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="grid grid-cols-2 bg-background border-b border-border">
                  <div className="px-3 py-2 text-sm font-bold text-foreground">
                    CAJA
                  </div>
                  <input
                    type="number"
                    value={caja}
                    onChange={(e) => setCaja(e.target.value)}
                    onBlur={() => guardarConteoMonedas(bolsa, caja)}
                    className="bg-background px-3 py-2 text-right text-sm font-bold outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="grid grid-cols-2 bg-primary/20">
                  <div className="px-3 py-2 text-sm font-bold text-primary">
                    TOTAL
                  </div>
                  <div className="px-3 py-2 text-right text-sm font-bold text-primary">
                    {formatCurrency(totalBolsaCaja)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
