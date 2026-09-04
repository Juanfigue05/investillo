import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  CreditCard, 
  Truck, 
  Receipt,
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
  { href: "/compras", label: "Compras", icon: Truck },
  { href: "/nos-debe", label: "Nos Debe", icon: HandCoins },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/historial", label: "Historial de Ventas", icon: BookOpen },  
  { href: "/reporte-pagos", label: "Reporte de Pagos", icon: Wallet },
  { href: "/mano-obra", label: "Trabajadores", icon: Wrench },
  { href: "/historial-cierres", label: "Historial Cierres", icon: History },
  { href: "/historial-precios", label: "Historial de Precios", icon: TrendingUp },
  
];

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();

  return (
    <div className="flex flex-col w-64 h-screen bg-card border-r border-border"
      style={{ minHeight: "100dvh" }}>
      <div className="pt-6 px-6 pb-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-lg">
              I
            </div>
            Investillo
          </h1>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight pl-10">Gestión con estilo y sencillo</p>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto pt-2 pb-4 flex flex-col gap-2 px-4">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                (item as any).dian
                  ? isActive
                    ? "bg-destructive/10 text-destructive font-medium"
                    : "text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                  : isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className={cn("w-5 h-5 transition-transform duration-200", isActive ? "scale-110" : "group-hover:scale-110")} />
              {item.label}
            </Link>
          );
        })}
      </div>
      <RelojColombia />
    </div>
  );
}
