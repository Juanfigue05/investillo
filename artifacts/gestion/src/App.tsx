import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, useEffect } from "react";
import { iniciarSincronizacionAutomatica } from "@/lib/sync-engine";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineOperationDialog } from "@/components/OfflineOperationDialog";
import { queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";

const Dashboard = lazy(() => import("@/pages/dashboard"));
const Inventario = lazy(() => import("@/pages/inventario"));
const VentasDiarias = lazy(() => import("@/pages/ventas"));
const Creditos = lazy(() => import("@/pages/creditos"));
const Compras = lazy(() => import("@/pages/compras"));
const Historial = lazy(() => import("@/pages/historial"));
const NosDebePage = lazy(() => import("@/pages/nos-debe"));
const HistorialPrecios = lazy(() => import("@/pages/historial-precios"));
const CierreDiario = lazy(() => import("@/pages/cierre-diario"));
const HistorialCierres = lazy(() => import("@/pages/historial-cierres"));
const ClientesPage = lazy(() => import("@/pages/clientes"));
const NotFound = lazy(() => import("@/pages/not-found"));
const ManoObra = lazy(() => import("@/pages/mano-obra"));
const ReportePagos = lazy(() => import("@/pages/reporte-pagos"));
const ReporteNomina = lazy(() => import("@/pages/reporte-nomina"));
const ObraElectronica = lazy(() => import("@/pages/obra-electronica"));
const DescuentosInventario = lazy(() => import("@/pages/descuentos-inventario"));

function PageLoading() {
  return (
    <div
      className="min-h-screen space-y-6 p-4 md:p-8"
      role="status"
      aria-label="Cargando pantalla"
    >
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/inventario" component={Inventario} />
      <Route path="/ventas" component={VentasDiarias} />
      <Route path="/creditos" component={Creditos} />
      <Route path="/compras" component={Compras} />
      <Route path="/historial" component={Historial} />
      <Route path="/nos-debe" component={NosDebePage} />
      <Route path="/historial-precios" component={HistorialPrecios} />
      <Route path="/cierre-diario" component={CierreDiario} />
      <Route path="/historial-cierres" component={HistorialCierres} />
      <Route path="/clientes" component={ClientesPage} />
      <Route path="/mano-obra" component={ManoObra} />
      <Route path="/reporte-pagos" component={ReportePagos} />
      <Route path="/reporte-nomina" component={ReporteNomina} />
      <Route path="/obra-electronica" component={ObraElectronica} />
      <Route path="/descuentos-inventario" component={DescuentosInventario} />
      <Route component={NotFound} />
    </Switch>
  );
}

function DocumentTitle() {
  const [location] = useLocation();

  useEffect(() => {
    const titulos: Record<string, string> = {
      "/": "Inicio",
      "/inventario": "Inventario",
      "/ventas": "Ventas",
      "/creditos": "Creditos",
      "/compras": "Compras",
      "/historial": "Historial",
      "/nos-debe": "Nos debe",
      "/historial-precios": "hist. precios",
      "/cierre-diario": "Cierre diario",
      "/historial-cierres": "hist. cierres",
      "/clientes": "Clientes",
      "/mano-obra": "Mano de obra",
      "/reporte-pagos": "Reporte pagos",
      "/reporte-nomina": "Nomina",
      "/obra-electronica": "OBRA ELECTRONICA",
      "/descuentos-inventario": "Descuentos de inventario",
    };
    document.title = titulos[location] || "Investillo";
  }, [location]);

  return null;
}

function App() {
  useEffect(() => {
    iniciarSincronizacionAutomatica();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <DocumentTitle />
            <Suspense fallback={<PageLoading />}>
              <Router />
            </Suspense>
          </WouterRouter>
          <Toaster />
          <OfflineOperationDialog />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
