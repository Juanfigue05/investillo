import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

// Pages
import Dashboard from "@/pages/dashboard";
import Inventario from "@/pages/inventario";
import VentasDiarias from "@/pages/ventas";
import Creditos from "@/pages/creditos";
import Compras from "@/pages/compras";
import ManoObra from "@/pages/mano-obra";
import Facturacion from "@/pages/facturacion";
import Historial from "@/pages/historial";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/inventario" component={Inventario} />
      <Route path="/ventas" component={VentasDiarias} />
      <Route path="/creditos" component={Creditos} />
      <Route path="/compras" component={Compras} />
      <Route path="/mano-obra" component={ManoObra} />
      <Route path="/facturacion" component={Facturacion} />
      <Route path="/historial" component={Historial} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
