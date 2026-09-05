import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { formatCurrency } from "@/lib/utils";
import { Check, Pencil, Printer, X } from "lucide-react";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");
const NOMBRES_MES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function datosDeEjemplo(mes: string) {
  const base = `${mes}-05`;
  return {
    tensionadas: [{ id: "demo-tensionada", fecha: base, valor: 180000 }],
    totalTensionadas: 180000,
    trabajadores: [{
      trabajadorId: "demo-trabajador",
      nombre: "EJEMPLO",
      dias: [
        { fecha: base, valor: 120000, descuentoOtros: 36000, seguro: 0, total: 84000, cierreId: "demo" },
        { fecha: `${mes}-06`, noVino: true },
        { fecha: `${mes}-07`, sinRegistro: true },
      ],
    }],
  };
}

export default function ReporteNomina() {
  const hoy = new Date();
  const [mes, setMes] = useState(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`);
  const [data, setData] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarEjemplo, setMostrarEjemplo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Record<string, string>>({});

  useEffect(() => {
    setCargando(true);
    fetch(`${API}/reportes/nomina?mes=${mes}`).then((r) => r.json()).then(setData).finally(() => setCargando(false));
  }, [mes]);

  const recargar = () => fetch(`${API}/reportes/nomina?mes=${mes}`).then((r) => r.json()).then(setData);
  const vista = mostrarEjemplo ? datosDeEjemplo(mes) : data;

  const fmtFecha = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" });
  const iniciarEdicion = (key: string, d: any) => {
    setEditando(key);
    setBorrador({ fecha: d.fecha, valor: String(d.valor), descuentoOtros: String(d.descuentoOtros), seguro: String(d.seguro), total: String(d.total) });
  };
  const guardarDia = async (fechaOriginal: string, trabajadorId: number, key: string) => {
    const res = await fetch(`${API}/reportes/nomina/dia`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fechaOriginal, trabajadorId, ...Object.fromEntries(Object.entries(borrador).map(([k, v]) => [k, k === "fecha" ? v : Number(v)])) }),
    });
    if (!res.ok) { alert((await res.json().catch(() => null))?.error || "No se pudo guardar"); return; }
    setEditando(null);
    await recargar();
  };
  const guardarTensionada = async (id: number, key: string) => {
    const res = await fetch(`${API}/tensionadas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha: borrador[`${key}:fecha`], valor: Number(borrador[`${key}:valor`]) }),
    });
    if (!res.ok) { alert("No se pudo guardar la tensionada"); return; }
    setEditando(null);
    await recargar();
  };

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex justify-between items-center no-print">
          <h1 className="text-2xl font-display font-bold text-foreground">Reporte de Nómina</h1>
          <div className="flex gap-2">
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
              className="bg-card border border-border px-3 py-2 rounded-xl text-sm" />
            <button onClick={() => setMostrarEjemplo((actual) => !actual)} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-xl text-sm font-medium">
              {mostrarEjemplo ? "Datos reales" : "Vista de ejemplo"}
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
              <Printer className="w-4 h-4" /> Imprimir
            </button>
          </div>
        </div>

        {cargando ? (
          <p className="text-center py-10 text-muted-foreground">Cargando...</p>
        ) : (
          <div className="flex flex-wrap gap-4 items-start justify-center print:gap-2">
            <div className="border-2 border-cyan-500 rounded-lg overflow-hidden text-xs" style={{ minWidth: 180 }}>
              <div className="bg-cyan-400 text-black font-bold text-center py-1">
                TENSIONADAS MES {NOMBRES_MES[parseInt(mes.split("-")[1])].toUpperCase()} {mes.split("-")[0]}
              </div>
              <table className="w-full bg-cyan-50">
                <thead>
                  <tr className="bg-cyan-200 text-black">
                    <th className="px-2 py-1 text-left">FECHA</th>
                    <th className="px-2 py-1 text-right">TOTAL TENSIONADA</th>
                  </tr>
                </thead>
                <tbody className="text-black">
                  {vista.tensionadas.map((tn: any) => {
                    const key = `tensionada-${tn.id}`;
                    const editandoEsta = editando === key && !mostrarEjemplo;
                    return (
                    <tr key={tn.id} className="border-t border-cyan-200">
                      <td className="px-2 py-1">
                        {editandoEsta ? <input type="date" value={borrador[`${key}:fecha`] || tn.fecha} onChange={(e) => setBorrador((p) => ({ ...p, [`${key}:fecha`]: e.target.value }))} /> : fmtFecha(tn.fecha)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {editandoEsta ? <input className="w-24 text-right" type="number" value={borrador[`${key}:valor`] || tn.valor} onChange={(e) => setBorrador((p) => ({ ...p, [`${key}:valor`]: e.target.value }))} /> : formatCurrency(tn.valor)}
                        {!mostrarEjemplo && <button className="no-print ml-1" onClick={() => editandoEsta ? guardarTensionada(tn.id, key) : iniciarEdicion(key, { fecha: tn.fecha, valor: tn.valor })}>{editandoEsta ? <Check className="inline w-3 h-3" /> : <Pencil className="inline w-3 h-3" />}</button>}
                        {editandoEsta && <button className="no-print ml-1" onClick={() => setEditando(null)}><X className="inline w-3 h-3" /></button>}
                      </td>
                    </tr>
                    );
                  })}
                  <tr className="border-t-2 border-cyan-400 font-bold bg-cyan-100">
                    <td className="px-2 py-1">TOTAL</td>
                    <td className="px-2 py-1 text-right">{formatCurrency(vista.totalTensionadas)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {vista?.trabajadores?.map((t: any) => (
              <div key={t.trabajadorId}>
                {/* Tabla amarilla del trabajador */}
                <div className="border-2 border-amber-500 rounded-lg overflow-hidden text-xs" style={{ minWidth: 280 }}>
                  <div className="bg-amber-400 text-black font-bold text-center py-1">
                    MES {NOMBRES_MES[parseInt(mes.split("-")[1])].toUpperCase()} {mes.split("-")[0]} {t.nombre.toUpperCase()}
                  </div>
                  <table className="w-full bg-amber-50">
                    <thead>
                      <tr className="bg-amber-200 text-black">
                        <th className="px-2 py-1 text-left">FECHA</th>
                        <th className="px-2 py-1 text-right">TOTAL MANO DE OBRA</th>
                        <th className="px-2 py-1 text-right">%</th>
                        <th className="px-2 py-1 text-right">TOTAL %</th>
                        <th className="px-2 py-1 text-right">SEGURO</th>
                        <th className="px-2 py-1 text-right">TOTAL MANO OBRA</th>
                      </tr>
                    </thead>
                    <tbody className="text-black">
                      {t.dias.map((d: any) => {
                        const key = `${t.trabajadorId}-${d.fecha}`;
                        const editandoEsta = editando === key && !mostrarEjemplo;
                        return <tr key={d.fecha} className="border-t border-amber-200">
                          <td className="px-2 py-1">
                            {editandoEsta ? <input type="date" value={borrador.fecha || d.fecha} onChange={(e) => setBorrador((p) => ({ ...p, fecha: e.target.value }))} /> : fmtFecha(d.fecha)}
                          </td>
                          {d.sinRegistro || d.noVino ? (
                            <td colSpan={5} className={`px-2 py-1 italic ${d.noVino ? "text-red-600" : "text-muted-foreground"}`}>
                              {d.noVino ? "No vino" : "No se trabajó"}
                            </td>
                          ) : (
                            <>
                              <td className="px-2 py-1 text-right">{editandoEsta ? <input className="w-20 text-right" type="number" value={borrador.valor} onChange={(e) => setBorrador((p) => ({ ...p, valor: e.target.value }))} /> : formatCurrency(d.valor)}</td>
                              <td className="px-2 py-1 text-right">30%</td>
                              <td className="px-2 py-1 text-right">{editandoEsta ? <input className="w-20 text-right" type="number" value={borrador.descuentoOtros} onChange={(e) => setBorrador((p) => ({ ...p, descuentoOtros: e.target.value }))} /> : formatCurrency(d.descuentoOtros)}</td>
                              <td className="px-2 py-1 text-right">{editandoEsta ? <input className="w-20 text-right" type="number" value={borrador.seguro} onChange={(e) => setBorrador((p) => ({ ...p, seguro: e.target.value }))} /> : formatCurrency(d.seguro)}</td>
                              <td className="px-2 py-1 text-right font-bold">{editandoEsta ? <input className="w-20 text-right" type="number" value={borrador.total} onChange={(e) => setBorrador((p) => ({ ...p, total: e.target.value }))} /> : formatCurrency(d.total)}
                                {!mostrarEjemplo && d.cierreId && <button className="no-print ml-1" onClick={() => editandoEsta ? guardarDia(d.fecha, t.trabajadorId, key) : iniciarEdicion(key, d)}>{editandoEsta ? <Check className="inline w-3 h-3" /> : <Pencil className="inline w-3 h-3" />}</button>}
                                {editandoEsta && <button className="no-print ml-1" onClick={() => setEditando(null)}><X className="inline w-3 h-3" /></button>}
                              </td>
                            </>
                          )}
                        </tr>
                      })}
                    </tbody>
                  </table>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}