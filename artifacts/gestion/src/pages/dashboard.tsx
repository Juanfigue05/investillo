import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { useGetDashboard, useGetAlertasStock, useGetVentasResumen } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  CreditCard,
  AlertTriangle,
  PackageX,
  Activity,
  BarChart3,
  ShoppingCart,
  HandCoins,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format, subDays, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { fechaHoyColombia, fechaColombia } from "@/lib/utils";
import { InstallAppCard } from "@/components/InstallAppCard";
import {
  guardarProductosAlertaColapsados,
  leerProductosAlertaColapsados,
  obtenerRangoAnio,
  obtenerRangoMes,
  sumarVentasResumen,
} from "@/lib/dashboard-analisis";
import { leerRespuestaApi } from "@/lib/respuesta-api";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");

type ResumenCreditosMes = {
  totalCreditosMes: number;
  saldoPendienteMes: number;
  cantidadCreditosMes: number;
  cantidadPendientesMes: number;
};

function TarjetaAnalisis({
  titulo,
  valor,
  detalle,
  icono: Icono,
  color,
  cargando,
  error,
}: {
  titulo: string;
  valor?: number;
  detalle: string;
  icono: typeof TrendingUp;
  color: string;
  cargando: boolean;
  error?: string;
}) {
  return (
    <div className="bg-card rounded-2xl p-4 lg:p-5 border border-border shadow-lg shadow-black/20">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium leading-tight">{titulo}</p>
          <h3 className="text-xl lg:text-2xl font-display font-bold mt-1 text-foreground truncate">
            {cargando ? "Cargando..." : error ? "No disponible" : formatCurrency(valor ?? 0)}
          </h3>
        </div>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
          <Icono className="w-5 h-5" />
        </div>
      </div>
      <p className={`mt-3 text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>
        {error || detalle}
      </p>
    </div>
  );
}

function buildRange(days: number) {
  const hasta = new Date();
  const desde = subDays(hasta, days - 1);
  return {
    desde: fechaColombia(desde),
    hasta: fechaColombia(hasta),
  };
}

function buildMonthRange() {
  const hoy = new Date();
  const desde = startOfMonth(subMonths(hoy, 1));
  const hasta = endOfMonth(subMonths(hoy, 1));
  return {
    desde: fechaColombia(desde),
    hasta: fechaColombia(hasta),
  };
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-xl p-3 shadow-xl text-sm">
        <p className="font-medium text-foreground mb-2">{label}</p>
        {payload.map((entry: any) => (
          <p key={entry.name} style={{ color: entry.color }}>
            {entry.name}: {formatCurrency(entry.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const [mesAnalisis, setMesAnalisis] = useState(() => fechaHoyColombia().slice(0, 7));
  const [anioAnalisis, setAnioAnalisis] = useState(() => Number(fechaHoyColombia().slice(0, 4)));
  const [productosAgotandoColapsados, setProductosAgotandoColapsados] = useState(leerProductosAlertaColapsados);
  const { data: dashboard, isLoading } = useGetDashboard();
  const { data: alertas } = useGetAlertasStock();

  useEffect(() => {
    guardarProductosAlertaColapsados(productosAgotandoColapsados);
  }, [productosAgotandoColapsados]);

  const range15 = buildRange(15);
  const range7 = buildRange(7);
  const mesRange = buildMonthRange();
  const rangoMesSeleccionado = obtenerRangoMes(mesAnalisis)!;
  const rangoAnioSeleccionado = obtenerRangoAnio(anioAnalisis)!;

  const { data: ventas15 } = useGetVentasResumen({ desde: range15.desde, hasta: range15.hasta });
  const { data: ventas7 } = useGetVentasResumen({ desde: range7.desde, hasta: range7.hasta });
  const { data: ventasMes } = useGetVentasResumen({ desde: mesRange.desde, hasta: mesRange.hasta });
  const ventasMesSeleccionadoQuery = useGetVentasResumen({
    desde: rangoMesSeleccionado.desde,
    hasta: rangoMesSeleccionado.hasta,
  });
  const ventasAnioSeleccionadoQuery = useGetVentasResumen({
    desde: rangoAnioSeleccionado.desde,
    hasta: rangoAnioSeleccionado.hasta,
  });
  const creditosMesQuery = useQuery({
    queryKey: ["/api/dashboard/analisis", mesAnalisis],
    queryFn: ({ signal }) => leerRespuestaApi<ResumenCreditosMes>(
      fetch(`${API}/dashboard/analisis?mes=${encodeURIComponent(mesAnalisis)}`, { signal }),
    ),
  });

  function fillDays(data: typeof ventas15, desde: string, hasta: string) {
    const result: { fecha: string; label: string; totalVentas: number }[] = [];
    const start = new Date(desde + "T12:00:00Z");
    const end = new Date(hasta + "T12:00:00Z");
    const map = new Map((data || []).map((d) => [d.fecha, d]));
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split("T")[0];
      const entry = map.get(key);
      result.push({
        fecha: key,
        label: format(d, "dd MMM", { locale: es }),
        totalVentas: entry?.totalVentas || 0,
      });
    }
    return result;
  }

  const chartData15 = fillDays(ventas15, range15.desde, range15.hasta);
  const chartDataMes = fillDays(ventasMes, mesRange.desde, mesRange.hasta);

  const total15Ventas = chartData15.reduce((a, d) => a + d.totalVentas, 0);
  const total7Ventas = (ventas7 || []).reduce((a, d) => a + (d.totalVentas || 0), 0);
  const totalMesVentas = chartDataMes.reduce((a, d) => a + d.totalVentas, 0);
  const totalVentasMesSeleccionado = sumarVentasResumen(ventasMesSeleccionadoQuery.data);
  const totalVentasAnioSeleccionado = sumarVentasResumen(ventasAnioSeleccionadoQuery.data);
  const etiquetaMesSeleccionado = new Date(`${mesAnalisis}-15T12:00:00`).toLocaleDateString("es-CO", {
    month: "long",
    year: "numeric",
  });
  const aniosDisponibles = Array.from({ length: 10 }, (_, indice) =>
    Number(fechaHoyColombia().slice(0, 4)) + 1 - indice,
  );

  if (isLoading || !dashboard) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </Layout>
    );
  }

  const statCards = [
    {
      title: "Ventas Hoy",
      value: formatCurrency(dashboard.totalVentasHoy),
      subtitle: `${dashboard.ventasHoy} transacciones`,
      icon: TrendingUp,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      title: "Créditos pendientes",
      value: formatCurrency(dashboard.noDeben),
      subtitle: `${dashboard.cantidadCreditos ?? 0} pendiente${(dashboard.cantidadCreditos ?? 0) === 1 ? "" : "s"}`,
      icon: CreditCard,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      title: "Nos Debe",
      value: formatCurrency(dashboard.totalNosDebe),
      subtitle: `${dashboard.cantidadNosDebe ?? 0} pendiente${(dashboard.cantidadNosDebe ?? 0) === 1 ? "" : "s"}`,
      icon: HandCoins,
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
    },
    {
      title: "Total Compras",
      value: formatCurrency(dashboard.totalComprasRecibidas ?? 0),
      subtitle: "Invertido en inventario",
      icon: ShoppingCart,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      title: "Alertas de Stock",
      value: dashboard.productosAlerta.toString(),
      subtitle: "Productos por agotarse",
      icon: AlertTriangle,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
    },
  ];

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Stats Grid — responsive */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 lg:gap-4">
          {statCards.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div
                key={i}
                className="bg-card rounded-2xl p-4 lg:p-5 border border-border shadow-lg shadow-black/20 hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-xs font-medium leading-tight">{stat.title}</p>
                    <h3 className="text-xl lg:text-2xl font-display font-bold mt-1 text-foreground truncate">{stat.value}</h3>
                  </div>
                  <div className={`w-9 h-9 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${stat.bg}`}>
                    <Icon className={`w-4 h-4 lg:w-5 lg:h-5 ${stat.color}`} />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <Activity className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{stat.subtitle}</span>
                </div>
              </div>
            );
          })}
          <InstallAppCard />
        </div>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-2xl p-4 lg:px-5">
            <div>
              <h3 className="font-bold text-foreground">Análisis de ventas y créditos</h3>
              <p className="text-xs text-muted-foreground mt-1">Los créditos se agrupan por fecha de factura; los pagos completos aparecen en ventas por fecha de pago.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Mes
                <input
                  type="month"
                  value={mesAnalisis}
                  onChange={(e) => {
                    if (obtenerRangoMes(e.target.value)) setMesAnalisis(e.target.value);
                  }}
                  aria-label="Mes para el análisis"
                  className="bg-background border border-border px-3 py-2 rounded-xl text-sm text-foreground"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Año
                <select
                  value={anioAnalisis}
                  onChange={(e) => setAnioAnalisis(Number(e.target.value))}
                  aria-label="Año para el análisis"
                  className="bg-background border border-border px-3 py-2 rounded-xl text-sm text-foreground"
                >
                  {aniosDisponibles.map((anio) => <option key={anio} value={anio}>{anio}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4">
            <TarjetaAnalisis
              titulo="Ventas del mes"
              valor={totalVentasMesSeleccionado}
              detalle={etiquetaMesSeleccionado}
              icono={TrendingUp}
              color="bg-green-500/10 text-green-500"
              cargando={ventasMesSeleccionadoQuery.isLoading}
              error={ventasMesSeleccionadoQuery.error instanceof Error ? ventasMesSeleccionadoQuery.error.message : undefined}
            />
            <TarjetaAnalisis
              titulo="Ventas del año"
              valor={totalVentasAnioSeleccionado}
              detalle={`Año ${anioAnalisis}`}
              icono={BarChart3}
              color="bg-purple-500/10 text-purple-500"
              cargando={ventasAnioSeleccionadoQuery.isLoading}
              error={ventasAnioSeleccionadoQuery.error instanceof Error ? ventasAnioSeleccionadoQuery.error.message : undefined}
            />
            <TarjetaAnalisis
              titulo="Créditos del mes"
              valor={creditosMesQuery.data?.totalCreditosMes}
              detalle={`${creditosMesQuery.data?.cantidadCreditosMes ?? 0} créditos · ${etiquetaMesSeleccionado}`}
              icono={CreditCard}
              color="bg-blue-500/10 text-blue-500"
              cargando={creditosMesQuery.isLoading}
              error={creditosMesQuery.error instanceof Error ? creditosMesQuery.error.message : undefined}
            />
            <TarjetaAnalisis
              titulo="Pendiente de pago del mes"
              valor={creditosMesQuery.data?.saldoPendienteMes}
              detalle={`${creditosMesQuery.data?.cantidadPendientesMes ?? 0} créditos con saldo`}
              icono={HandCoins}
              color="bg-cyan-500/10 text-cyan-500"
              cargando={creditosMesQuery.isLoading}
              error={creditosMesQuery.error instanceof Error ? creditosMesQuery.error.message : undefined}
            />
          </div>
        </section>

        {/* Charts Section */}
        <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 shadow-lg">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h3 className="text-base lg:text-lg font-bold text-foreground">Ventas por período</h3>
            </div>
          </div>

          {/* 15-day chart */}
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData15} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={1}
              />
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                width={42}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: "11px", color: "hsl(var(--muted-foreground))", paddingTop: "12px" }}
              />
              <Bar dataKey="totalVentas" name="Ventas" fill="var(--graph-color-1, hsl(var(--primary)))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {/* Summary table: Hoy / 7 días / 15 días */}
          <div className="mt-4 pt-4 border-t border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[360px]">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left pb-2 font-medium">Período</th>
                  <th className="text-right pb-2 font-medium">Ventas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                <tr>
                  <td className="py-2 text-muted-foreground text-xs">Hoy</td>
                  <td className="py-2 text-right font-bold text-foreground">{formatCurrency(dashboard.totalVentasHoy)}</td>
                </tr>
                <tr>
                  <td className="py-2 text-muted-foreground text-xs">Últimos 7 días</td>
                  <td className="py-2 text-right font-bold text-foreground">{formatCurrency(total7Ventas)}</td>
                </tr>
                <tr>
                  <td className="py-2 text-muted-foreground text-xs">Últimos 15 días</td>
                  <td className="py-2 text-right font-bold text-foreground">{formatCurrency(total15Ventas)}</td>
                </tr>
                <tr>
                  <td className="py-2 text-muted-foreground text-xs">Mes anterior</td>
                  <td className="py-2 text-right font-bold text-foreground">{formatCurrency(totalMesVentas)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Alerts Section */}
        {alertas && alertas.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4 lg:p-5 border-b border-destructive/20">
              <div className="flex items-center gap-3 min-w-0">
                <PackageX className="w-5 h-5 text-destructive flex-shrink-0" />
                <h3 className="text-sm lg:text-base font-bold text-destructive">Productos Agotándose ({alertas.length})</h3>
              </div>
              <button
                type="button"
                aria-expanded={!productosAgotandoColapsados}
                aria-controls={!productosAgotandoColapsados ? "productos-agotandose-lista" : undefined}
                onClick={() => setProductosAgotandoColapsados((colapsados) => !colapsados)}
                className="flex items-center gap-2 shrink-0 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
              >
                {productosAgotandoColapsados ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                {productosAgotandoColapsados ? "Mostrar" : "Minimizar"}
              </button>
            </div>
            {!productosAgotandoColapsados && <div id="productos-agotandose-lista" className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-destructive/10 text-muted-foreground border-b border-destructive/20">
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Referencia</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Producto</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap hidden sm:table-cell">Marca</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap text-right">Stock actual</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap text-right hidden sm:table-cell">Stock mínimo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-destructive/10">
                  {alertas.map((prod) => (
                    <tr key={prod.id} className="hover:bg-destructive/5 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {prod.referencia || prod.codigo}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{prod.nombre}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{prod.marca || "—"}</td>
                      <td className="px-4 py-3 text-right font-bold text-destructive">
                        {typeof prod.stockActual === "number"
                          ? prod.stockActual.toLocaleString("es-CO", { maximumFractionDigits: 2 })
                          : prod.stockActual}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">
                        {typeof prod.stockMinimo === "number"
                          ? prod.stockMinimo.toLocaleString("es-CO", { maximumFractionDigits: 2 })
                          : prod.stockMinimo}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
          </div>
        )}
      </div>
    </Layout>
  );
}
