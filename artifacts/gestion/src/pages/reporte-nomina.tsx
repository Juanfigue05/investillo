import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { formatCurrency } from "@/lib/utils";
import { Printer } from "lucide-react";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");
const NOMBRES_MES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function ReporteNomina() {
  const hoy = new Date();
  const [mes, setMes] = useState(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`);
  const [data, setData] = useState<any>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    fetch(`${API}/reportes/nomina?mes=${mes}`).then((r) => r.json()).then(setData).finally(() => setCargando(false));
  }, [mes]);

  const fmtFecha = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" });

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex justify-between items-center no-print">
          <h1 className="text-2xl font-display font-bold text-foreground">Reporte de Nómina</h1>
          <div className="flex gap-2">
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
              className="bg-card border border-border px-3 py-2 rounded-xl text-sm" />
            <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
              <Printer className="w-4 h-4" /> Imprimir
            </button>
          </div>
        </div>

        {cargando ? (
          <p className="text-center py-10 text-muted-foreground">Cargando...</p>
        ) : (
          <div className="flex flex-wrap gap-4 items-start justify-center print:gap-2">
            {data?.trabajadores?.map((t: any, idx: number) => (
              <>
                {/* Tabla amarilla del trabajador */}
                <div key={t.trabajadorId} className="border-2 border-amber-500 rounded-lg overflow-hidden text-xs" style={{ minWidth: 280 }}>
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
                      {t.dias.map((d: any) => (
                        <tr key={d.fecha} className="border-t border-amber-200">
                          <td className="px-2 py-1">{fmtFecha(d.fecha)}</td>
                          {d.sinRegistro ? (
                            <td colSpan={5} className="px-2 py-1 text-muted-foreground italic">No se trabajó</td>
                          ) : (
                            <>
                              <td className="px-2 py-1 text-right">{formatCurrency(d.valor)}</td>
                              <td className="px-2 py-1 text-right">30%</td>
                              <td className="px-2 py-1 text-right">{formatCurrency(d.descuentoOtros)}</td>
                              <td className="px-2 py-1 text-right">{formatCurrency(d.seguro)}</td>
                              <td className="px-2 py-1 text-right font-bold">{formatCurrency(d.total)}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* La tabla azul de Tensionadas va justo después de la primera tabla */}
                {idx === 0 && (
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
                        {data.tensionadas.map((tn: any) => (
                          <tr key={tn.id} className="border-t border-cyan-200">
                            <td className="px-2 py-1">{fmtFecha(tn.fecha)}</td>
                            <td className="px-2 py-1 text-right">{formatCurrency(tn.valor)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-cyan-400 font-bold bg-cyan-100">
                          <td className="px-2 py-1">TOTAL</td>
                          <td className="px-2 py-1 text-right">{formatCurrency(data.totalTensionadas)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}