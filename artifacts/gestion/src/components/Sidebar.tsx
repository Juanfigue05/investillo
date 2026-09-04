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
import { RelojColombia } from "./RelojColombia";

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
];

export function Sidebar({
  onClose,
  expandido,
  onMouseEnter,
  onMouseLeave,
}: {
  onClose?: () => void;
  expandido: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const [location] = useLocation();

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        "flex flex-col h-screen bg-card border-r border-border transition-all duration-300 overflow-hidden",
        expandido ? "w-64" : "w-20"
      )}
      style={{ minHeight: "100dvh" }}
    >
      <div className={cn("pt-6 pb-3 transition-all duration-300", expandido ? "px-6" : "px-0 flex justify-center")}>
        <div>
          <h1 className={cn("text-2xl font-display font-bold text-primary flex items-center", expandido ? "gap-2" : "justify-center")}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
              I
            </div>
            {expandido && "Investillo"}
          </h1>
          {expandido && (
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight pl-10">Gestión con estilo y sencillo</p>
          )}
        </div>
      </div>
      
      <div className={cn("flex-1 overflow-y-auto overflow-x-hidden pt-2 pb-4 flex flex-col gap-2", expandido ? "px-4" : "px-2")}>
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              title={!expandido ? item.label : undefined}
              className={cn(
                "flex items-center rounded-xl transition-all duration-200 group whitespace-nowrap",
                expandido ? "gap-3 px-4 py-3" : "gap-0 px-0 py-3 justify-center",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className={cn("w-5 h-5 flex-shrink-0 transition-transform duration-200", isActive ? "scale-110" : "group-hover:scale-110")} />
              {expandido && item.label}
            </Link>
          );
        })}
      </div>
      {expandido && <RelojColombia />}
    </div>
  );
}