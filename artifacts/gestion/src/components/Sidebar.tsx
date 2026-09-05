import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  CreditCard, 
  Truck, 
  BookOpen,
  HandCoins,
  TrendingUp,
  Calculator,
  History,
  Users,
  Wrench,
  Wallet
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cierre-diario", label: "Cierre Diario", icon: Calculator },
  { href: "/inventario", label: "Inventario", icon: Package },
  { href: "/ventas", label: "Ventas Diarias", icon: ShoppingCart },
  { href: "/creditos", label: "Créditos", icon: CreditCard },
  { href: "/nos-debe", label: "Nos Debe", icon: HandCoins },
  { href: "/compras", label: "Compras", icon: Truck },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/historial", label: "Historial de Ventas", icon: BookOpen },  
  { href: "/reporte-pagos", label: "Reporte de Pagos", icon: Wallet },
  { href: "/mano-obra", label: "Trabajadores", icon: Wrench },
  { href: "/historial-cierres", label: "Historial Cierres", icon: History },
  { href: "/historial-precios", label: "Historial de Precios", icon: TrendingUp },
  { href: "/reporte-nomina", label: "Reporte de Nómina", icon: Wallet }
];

export function Sidebar({
  onClose,
}: {
  onClose?: () => void;
}) {
  const [location] = useLocation();

  return (
    <div
      className="flex flex-col h-screen w-40 bg-card border-r border-border overflow-hidden"
      style={{ minHeight: "100dvh" }}
    >
      <div className="pt-5 pb-3 px-3">
        <div>
          <h1 className="text-lg font-display font-bold text-primary flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-base flex-shrink-0">
              I
            </div>
            <span>Investillo</span>
          </h1>
          <p className="text-[8px] text-muted-foreground mt-0.5 leading-tight pl-9">Gestión con estilo y sencillo</p>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto overflow-x-hidden pt-2 pb-4 px-2 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-2 rounded-xl px-2 py-2.5 transition-colors duration-200 group whitespace-nowrap text-xs",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className={cn("w-4 h-4 flex-shrink-0", isActive ? "scale-110" : "group-hover:scale-110")} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}