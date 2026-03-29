import { Layout } from "@/components/Layout";
import { useGetDashboard, useGetAlertasStock, useGetVentasResumen } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";
import {
  TrendingUp,
  Wrench,
  CreditCard,
  AlertTriangle,
  PackageX,
  Activity,
  BarChart3,
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

function buildRange(days: number) {
  const hasta = new Date();
  const desde = subDays(hasta, days - 1);
  return {
    desde: desde.toISOString().split("T")[0],
    hasta: hasta.toISOString().split("T")[0],
  };
}

function buildMonthRange() {
  const hoy = new Date();
  const desde = startOfMonth(subMonths(hoy, 1));
  const hasta = endOfMonth(subMonths(hoy, 1));
  return {
    desde: desde.toISOString().split("T")[0],
    hasta: hasta.toISOString().split("T")[0],
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
  const [chartMode, setChartMode] = useState<"semana" | "mes">("semana");

  const { data: dashboard, isLoading } = useGetDashboard();
  const { data: alertas } = useGetAlertasStock();

  const semanaRange = buildRange(7);
  const mesRange = chartMode === "mes" ? buildMonthRange() : buildRange(30);

  const { data: ventasSemana } = useGetVentasResumen({ desde: semanaRange.desde, hasta: semanaRange.hasta });
  const { data: ventasMes } = useGetVentasResumen({ desde: mesRange.desde, hasta: mesRange.hasta });

  // Fill missing days with 0
  function fillDays(data: typeof ventasSemana, desde: string, hasta: string) {
    const result: { fecha: string; label: string; totalVentas: number; totalManoObra: number }[] = [];
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
        totalManoObra: entry?.totalManoObra || 0,
      });
    }
    return result;
  }

  const chartDataSemana = fillDays(ventasSemana, semanaRange.desde, semanaRange.hasta);
  const chartDataMes = fillDays(ventasMes, mesRange.desde, mesRange.hasta);

  const totalSemana = chartDataSemana.reduce((a, d) => a + d.totalVentas, 0);
  const totalMoSemana = chartDataSemana.reduce((a, d) => a + d.totalManoObra, 0);
  const totalMes = chartDataMes.reduce((a, d) => a + d.totalVentas, 0);
  const totalMoMes = chartDataMes.reduce((a, d) => a + d.totalManoObra, 0);

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
      title: "Mano de Obra Hoy",
      value: formatCurrency(dashboard.totalManoObraHoy),
      subtitle: "Servicios facturados hoy",
      icon: Wrench,
      color: "text-yellow-500",
      bg: "bg-yellow-500/10",
    },
    {
      title: "Nos Deben",
      value: formatCurrency(dashboard.noDeben),
      subtitle: "En créditos activos",
      icon: CreditCard,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
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
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div
                key={i}
                className="bg-card rounded-2xl p-6 border border-border shadow-lg shadow-black/20 hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">{stat.title}</p>
                    <h3 className="text-3xl font-display font-bold mt-2 text-foreground">{stat.value}</h3>
                  </div>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.bg}`}>
                    <Icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="w-4 h-4" />
                  {stat.subtitle}
                </div>
              </div>
            );
          })}
        </div>

        {/* Charts Section */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-bold text-foreground">Ventas por período</h3>
            </div>
            <div className="flex bg-muted rounded-xl p-1 gap-1">
              <button
                onClick={() => setChartMode("semana")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  chartMode === "semana"
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Últimos 7 días
              </button>
              <button
                onClick={() => setChartMode("mes")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  chartMode === "mes"
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Mes anterior
              </button>
            </div>
          </div>

          {chartMode === "semana" ? (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartDataSemana} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ fontSize: "12px", color: "hsl(var(--muted-foreground))", paddingTop: "16px" }}
                  />
                  <Bar dataKey="totalVentas" name="Ventas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="totalManoObra" name="Mano de Obra" fill="#eab308" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              {/* Summary below chart */}
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
                <div className="bg-background rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Ventas (7 días)</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(totalSemana)}</p>
                </div>
                <div className="bg-background rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Mano de Obra (7 días)</p>
                  <p className="text-2xl font-bold text-yellow-500">{formatCurrency(totalMoSemana)}</p>
                </div>
              </div>
            </>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartDataMes} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    interval={2}
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ fontSize: "12px", color: "hsl(var(--muted-foreground))", paddingTop: "16px" }}
                  />
                  <Bar dataKey="totalVentas" name="Ventas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="totalManoObra" name="Mano de Obra" fill="#eab308" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
                <div className="bg-background rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Ventas (mes ant.)</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(totalMes)}</p>
                </div>
                <div className="bg-background rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total M. Obra (mes ant.)</p>
                  <p className="text-2xl font-bold text-yellow-500">{formatCurrency(totalMoMes)}</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Alerts Section */}
        {alertas && alertas.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <PackageX className="w-6 h-6 text-destructive" />
              <h3 className="text-lg font-bold text-destructive">Atención: Productos Agotándose</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {alertas.map((prod) => (
                <div
                  key={prod.id}
                  className="bg-card rounded-xl p-4 border border-border flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium text-foreground">{prod.nombre}</p>
                    <p className="text-sm text-muted-foreground">Ref: {prod.referencia || prod.codigo}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-destructive">{prod.stockActual}</p>
                    <p className="text-xs text-muted-foreground">Min: {prod.stockMinimo}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
