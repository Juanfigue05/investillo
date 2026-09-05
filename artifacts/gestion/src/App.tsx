import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { iniciarSincronizacionAutomatica } from "@/lib/sync-engine";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Pages
import Dashboard from "@/pages/dashboard";
import Inventario from "@/pages/inventario";
import VentasDiarias from "@/pages/ventas";
import Creditos from "@/pages/creditos";
import Compras from "@/pages/compras";
import Historial from "@/pages/historial";
import NosDebePage from "@/pages/nos-debe";
import HistorialPrecios from "@/pages/historial-precios";
import CierreDiario from "@/pages/cierre-diario";
import HistorialCierres from "@/pages/historial-cierres";
import ClientesPage from "@/pages/clientes";
import NotFound from "@/pages/not-found";
import ManoObra from "@/pages/mano-obra";
import ReportePagos from "@/pages/reporte-pagos";
import ReporteNomina from "@/pages/reporte-nomina";

import { queryClient } from "@/lib/queryClient";

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
      <Route component={NotFound} />
    </Switch>
  );
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
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
