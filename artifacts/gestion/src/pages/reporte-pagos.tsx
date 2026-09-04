import { useState, useEffect, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { formatCurrency } from "@/lib/utils";
import { Wallet, Landmark, CreditCard, Banknote } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");

interface DiaPago {
  fecha: string;
  efectivo: number;
  cuenta_ernesto: number;
  cuenta_olga: number;
  cuenta_juan: number;
  total: number;
}
interface MesPago { mes: string; efectivo: number; cuenta_ernesto: number; cuenta_olga: number; cuenta_juan: number; total: number; }

const NOMBRES_MES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const TARJETAS = [
  { key: "efectivo", label: "Efectivo", icon: Banknote, color: "text-emerald-400", bg: "bg-emerald-500/10", chart: "#34d399" },
  { key: "cuenta_ernesto", label: "Cuenta Ernesto", icon: Landmark, color: "text-blue-400", bg: "bg-blue-500/10", chart: "#60a5fa" },
  { key: "cuenta_olga", label: "Cuenta Olga", icon: Landmark, color: "text-pink-400", bg: "bg-pink-500/10", chart: "#f472b6" },
  { key: "cuenta_juan", label: "Cuenta Juan", icon: Landmark, color: "text-amber-400", bg: "bg-amber-500/10", chart: "#fbbf24" },
] as const;

export default function ReportePagos() {
  const [porDia, setPorDia] = useState<DiaPago[]>([]);
  const [porMes, setPorMes] = useState<MesPago[]>([]);
  const [mesSeleccionado, setMesSeleccionado] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    fetch(`${API}/reportes/formas-pago`)
      .then((r) => r.json())
      .then((data) => {
        setPorDia(data.porDia || []);
        setPorMes(data.porMes || []);
        if (data.porMes?.length) setMesSeleccionado(data.porMes[data.porMes.length - 1].mes);
      })
      .finally(() => setCargando(false));
  }, []);

  const diasDelMes = useMemo(
    () => porDia.filter((d) => d.fecha.startsWith(mesSeleccionado)).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [porDia, mesSeleccionado]
  );

  const totalesMes = useMemo(() => {
    const acc = { efectivo: 0, cuenta_ernesto: 0, cuenta_olga: 0, cuenta_juan: 0, total: 0 };
    for (const d of diasDelMes) {
      acc.efectivo += d.efectivo; acc.cuenta_ernesto += d.cuenta_ernesto;
      acc.cuenta_olga += d.cuenta_olga; acc.cuenta_juan += d.cuenta_juan; acc.total += d.total;
    }
    return acc;
  }, [diasDelMes]);

  const datosGrafica = porMes.map((m) => ({
    mes: `${NOMBRES_MES[parseInt(m.mes.split("-")[1])].slice(0, 3)} ${m.mes.split("-")[0].slice(2)}`,
    Efectivo: m.efectivo, "Cta. Ernesto": m.cuenta_ernesto, "Cta. Olga": m.cuenta_olga, "Cta. Juan": m.cuenta_juan,
  }));

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Reporte de Pagos</h1>
            <p className="text-muted-foreground mt-1 text-sm">Cuánto ha entrado por cada forma de pago.</p>
          </div>
          {porMes.length > 0 && (
            <select value={mesSeleccionado} onChange={(e) => setMesSeleccionado(e.target.value)}
              className="bg-card border border-border px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none">
              {porMes.map((m) => (
                <option key={m.mes} value={m.mes}>{NOMBRES_MES[parseInt(m.mes.split("-")[1])]} {m.mes.split("-")[0]}</option>
              ))}
            </select>
          )}
        </div>

        {cargando ? (
          <div className="text-center py-10 text-muted-foreground text-sm">Cargando reporte...</div>
        ) : porDia.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
            <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Todavía no hay ventas registradas con forma de pago.</p>
          </div>
        ) : (
          <>
            {/* Tarjetas del mes seleccionado */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
              {TARJETAS.map((t) => {
                const Icon = t.icon;
                return (
                  <div key={t.key} className="bg-card rounded-2xl p-4 border border-border shadow-lg">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-muted-foreground text-xs font-medium">{t.label}</p>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${t.bg}`}>
                        <Icon className={`w-4 h-4 ${t.color}`} />
                      </div>
                    </div>
                    <h3 className="text-lg lg:text-xl font-display font-bold mt-2 text-foreground">{formatCurrency((totalesMes as any)[t.key])}</h3>
                  </div>
                );
              })}
              <div className="bg-primary/10 rounded-2xl p-4 border border-primary/30 shadow-lg">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-muted-foreground text-xs font-medium">Total del mes</p>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary/20 flex-shrink-0">
                    <CreditCard className="w-4 h-4 text-primary" />
                  </div>
                </div>
                <h3 className="text-lg lg:text-xl font-display font-bold mt-2 text-primary">{formatCurrency(totalesMes.total)}</h3>
              </div>
            </div>

            {/* Gráfica de los últimos 6 meses */}
            <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 shadow-lg">
              <h3 className="text-sm font-bold text-foreground mb-4">Últimos {porMes.length} mes(es) por forma de pago</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={datosGrafica} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 20% 25%)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "hsl(215 15% 65%)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(215 15% 65%)" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} width={50} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: "hsl(222 25% 12%)", border: "1px solid hsl(217 20% 25%)", borderRadius: 8, color: "#fff" }} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Bar dataKey="Efectivo" stackId="a" fill="#34d399" />
                  <Bar dataKey="Cta. Ernesto" stackId="a" fill="#60a5fa" />
                  <Bar dataKey="Cta. Olga" stackId="a" fill="#f472b6" />
                  <Bar dataKey="Cta. Juan" stackId="a" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Tabla diaria del mes seleccionado */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-muted text-muted-foreground border-b border-border">
                      <th className="px-4 py-3 font-medium whitespace-nowrap">Fecha</th>
                      <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Efectivo</th>
                      <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Cta. Ernesto</th>
                      <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Cta. Olga</th>
                      <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Cta. Juan</th>
                      <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Total día</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {diasDelMes.map((d) => (
                      <tr key={d.fecha} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{new Date(d.fecha + "T12:00:00").toLocaleDateString("es-CO")}</td>
                        <td className="px-4 py-2.5 text-right">{d.efectivo > 0 ? formatCurrency(d.efectivo) : "—"}</td>
                        <td className="px-4 py-2.5 text-right">{d.cuenta_ernesto > 0 ? formatCurrency(d.cuenta_ernesto) : "—"}</td>
                        <td className="px-4 py-2.5 text-right">{d.cuenta_olga > 0 ? formatCurrency(d.cuenta_olga) : "—"}</td>
                        <td className="px-4 py-2.5 text-right">{d.cuenta_juan > 0 ? formatCurrency(d.cuenta_juan) : "—"}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-primary">{formatCurrency(d.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-border bg-muted/30">
                    <tr>
                      <td className="px-4 py-3 font-bold text-foreground">Total del mes</td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">{formatCurrency(totalesMes.efectivo)}</td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">{formatCurrency(totalesMes.cuenta_ernesto)}</td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">{formatCurrency(totalesMes.cuenta_olga)}</td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">{formatCurrency(totalesMes.cuenta_juan)}</td>
                      <td className="px-4 py-3 text-right font-display font-bold text-lg text-primary">{formatCurrency(totalesMes.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}