import { useState, useEffect, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { fechaHoyColombia, formatCurrency } from "@/lib/utils";
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

const CAMPOS_PAGO = ["efectivo", "cuenta_ernesto", "cuenta_olga", "cuenta_juan"] as const;
const CLAVES_FESTIVOS_FIJOS = ["01-01", "05-01", "07-20", "08-07", "12-08", "12-25"];

function sumarDias(fecha: string, dias: number) {
  const date = new Date(`${fecha}T12:00:00`);
  date.setDate(date.getDate() + dias);
  return date.toISOString().slice(0, 10);
}

function pascua(anio: number) {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function esFestivoColombia(fecha: string) {
  const anio = Number(fecha.slice(0, 4));
  if (CLAVES_FESTIVOS_FIJOS.includes(fecha.slice(5))) return true;
  const lunesSiguiente = (base: string) => {
    const dia = new Date(`${base}T12:00:00`).getDay();
    return sumarDias(base, dia === 0 ? 1 : (8 - dia) % 7);
  };
  const festivosEmiliani = [`${anio}-01-06`, `${anio}-03-19`, `${anio}-06-29`, `${anio}-08-15`, `${anio}-10-12`, `${anio}-11-01`, `${anio}-11-11`].map(lunesSiguiente);
  const pascuaFecha = pascua(anio);
  return festivosEmiliani.includes(fecha) || [-3, -2, 43, 64, 71].map((dias) => sumarDias(pascuaFecha, dias)).includes(fecha);
}

function esDiaLaborable(fecha: string) {
  const dia = new Date(`${fecha}T12:00:00`).getDay();
  return dia !== 0 && !esFestivoColombia(fecha);
}

function etiquetaFecha(fecha: string) {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }).replace(".", "");
}

function etiquetaMes(mes: string | undefined, abreviado = false) {
  const clave = typeof mes === "string" ? mes : "";
  const partes = clave.split("-");
  const numeroMes = Number(partes[1]);
  const nombre = NOMBRES_MES[numeroMes] || "Mes";
  return `${abreviado ? nombre.slice(0, 3) : nombre} ${partes[0] || ""}`.trim();
}

type DatoGraficaPago = { etiqueta: string; Efectivo: number; "Cta. Ernesto": number; "Cta. Olga": number; "Cta. Juan": number; Total?: number };

function GraficaPagos({ titulo, data, dataKey = "etiqueta" }: { titulo: string; data: DatoGraficaPago[]; dataKey?: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 shadow-lg">
      <h3 className="text-sm font-bold text-foreground mb-4">{titulo}</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 20% 25%)" />
          <XAxis dataKey={dataKey} tick={{ fontSize: 11, fill: "hsl(215 15% 65%)" }} />
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
  );
}

export default function ReportePagos() {
  const [porDia, setPorDia] = useState<DiaPago[]>([]);
  const [porMes, setPorMes] = useState<MesPago[]>([]);
  const [mesSeleccionado, setMesSeleccionado] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    fetch(`${API}/reportes/formas-pago`)
      .then((r) => r.json())
      .then((data) => {
        const dias = Array.isArray(data?.porDia) ? data.porDia.filter((dia: DiaPago) => typeof dia?.fecha === "string") : [];
        const meses = Array.isArray(data?.porMes) ? data.porMes.filter((mes: MesPago) => typeof mes?.mes === "string" && /^\d{4}-\d{2}$/.test(mes.mes)) : [];
        setPorDia(dias);
        setPorMes(meses);
        if (meses.length) setMesSeleccionado(meses[meses.length - 1].mes);
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

  const hoy = fechaHoyColombia();
  const datosPorFecha = useMemo(() => new Map(porDia.map((dia) => [dia.fecha, dia])), [porDia]);
  const crearDatoDia = (fecha: string) => {
    const dia = datosPorFecha.get(fecha);
    return { fecha, etiqueta: etiquetaFecha(fecha), Efectivo: dia?.efectivo || 0, "Cta. Ernesto": dia?.cuenta_ernesto || 0, "Cta. Olga": dia?.cuenta_olga || 0, "Cta. Juan": dia?.cuenta_juan || 0, Total: dia?.total || 0 };
  };
  const ultimos7Dias = useMemo(() => {
    const fechas: string[] = [];
    let fecha = hoy;
    while (fechas.length < 7) {
      if (esDiaLaborable(fecha)) fechas.unshift(fecha);
      fecha = sumarDias(fecha, -1);
    }
    return fechas.map(crearDatoDia);
  }, [porDia, hoy]);
  const mesActual = hoy.slice(0, 7);
  const totalesMesActual = useMemo(() => porDia.filter((dia) => dia.fecha.startsWith(mesActual)).reduce((total, dia) => ({ efectivo: total.efectivo + dia.efectivo, cuenta_ernesto: total.cuenta_ernesto + dia.cuenta_ernesto, cuenta_olga: total.cuenta_olga + dia.cuenta_olga, cuenta_juan: total.cuenta_juan + dia.cuenta_juan }), { efectivo: 0, cuenta_ernesto: 0, cuenta_olga: 0, cuenta_juan: 0 }), [porDia, mesActual]);
  const mesesDisponibles = useMemo(() => {
    const resultado: string[] = [];
    for (let offset = 11; offset >= 0; offset -= 1) {
      const fecha = new Date(`${hoy}-01T12:00:00`);
      fecha.setMonth(fecha.getMonth() - offset);
      resultado.push(`${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`);
    }
    return resultado;
  }, [hoy]);
  const datosPorMes = useMemo(() => mesesDisponibles.map((mes) => {
    const valores = porMes.find((dato) => dato.mes === mes);
    return { etiqueta: etiquetaMes(mes, true), Efectivo: valores?.efectivo || 0, "Cta. Ernesto": valores?.cuenta_ernesto || 0, "Cta. Olga": valores?.cuenta_olga || 0, "Cta. Juan": valores?.cuenta_juan || 0 };
  }), [mesesDisponibles, porMes]);
  const datos3Meses = datosPorMes.slice(-3);
  const datos6Meses = datosPorMes.slice(-6);
  const datos12Meses = datosPorMes;
  const totalesAnio = useMemo(() => {
    const valores = porDia.filter((dia) => dia.fecha.startsWith(hoy.slice(0, 4)));
    return CAMPOS_PAGO.reduce((acc, campo) => ({ ...acc, [campo]: valores.reduce((total, dia) => total + dia[campo], 0) }), {} as Record<string, number>);
  }, [porDia, hoy]);

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
                <option key={m.mes} value={m.mes}>{etiquetaMes(m.mes)}</option>
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

            <GraficaPagos titulo="Últimos 7 días laborables" data={ultimos7Dias} />
            <GraficaPagos
              titulo={`Total del mes actual (${NOMBRES_MES[Number(mesActual.slice(5))]} ${mesActual.slice(0, 4)})`}
              data={[{ etiqueta: NOMBRES_MES[Number(mesActual.slice(5))], Efectivo: totalesMesActual.efectivo, "Cta. Ernesto": totalesMesActual.cuenta_ernesto, "Cta. Olga": totalesMesActual.cuenta_olga, "Cta. Juan": totalesMesActual.cuenta_juan }]}
            />
            <GraficaPagos titulo="Últimos 3 meses por forma de pago" data={datos3Meses} />
            <GraficaPagos titulo="Últimos 6 meses por forma de pago" data={datos6Meses} />
            <GraficaPagos titulo="Últimos 12 meses por forma de pago" data={datos12Meses} />
            <GraficaPagos
              titulo={`Totales por forma de pago en ${hoy.slice(0, 4)}`}
              data={[{ etiqueta: hoy.slice(0, 4), Efectivo: totalesAnio.efectivo || 0, "Cta. Ernesto": totalesAnio.cuenta_ernesto || 0, "Cta. Olga": totalesAnio.cuenta_olga || 0, "Cta. Juan": totalesAnio.cuenta_juan || 0 }]}
            />

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