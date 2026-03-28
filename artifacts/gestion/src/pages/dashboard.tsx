import { Layout } from "@/components/Layout";
import { useGetDashboard, useGetAlertasStock } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { 
  TrendingUp, 
  Wrench, 
  CreditCard, 
  AlertTriangle,
  PackageX,
  Activity
} from "lucide-react";

export default function Dashboard() {
  const { data: dashboard, isLoading } = useGetDashboard();
  const { data: alertas } = useGetAlertasStock();

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
      bg: "bg-green-500/10"
    },
    {
      title: "Mano de Obra Hoy",
      value: formatCurrency(dashboard.totalManoObraHoy),
      subtitle: "Servicios facturados hoy",
      icon: Wrench,
      color: "text-yellow-500",
      bg: "bg-yellow-500/10"
    },
    {
      title: "Nos Deben",
      value: formatCurrency(dashboard.noDeben),
      subtitle: "En créditos activos",
      icon: CreditCard,
      color: "text-blue-500",
      bg: "bg-blue-500/10"
    },
    {
      title: "Alertas de Stock",
      value: dashboard.productosAlerta.toString(),
      subtitle: "Productos por agotarse",
      icon: AlertTriangle,
      color: "text-orange-500",
      bg: "bg-orange-500/10"
    }
  ];

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div key={i} className="bg-card rounded-2xl p-6 border border-border shadow-lg shadow-black/20 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
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

        {/* Alerts Section */}
        {alertas && alertas.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <PackageX className="w-6 h-6 text-destructive" />
              <h3 className="text-lg font-bold text-destructive">Atención: Productos Agotándose</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {alertas.map(prod => (
                <div key={prod.id} className="bg-card rounded-xl p-4 border border-border flex justify-between items-center">
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
