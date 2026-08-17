import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  CreditCard, 
  Truck, 
  Receipt,
  BookOpen,
  LogOut,
  HandCoins,
  TrendingUp,
  Calculator,
  History,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventario", label: "Inventario", icon: Package },
  { href: "/cierre-diario", label: "Cierre Diario", icon: Calculator },
  { href: "/historial-cierres", label: "Historial Cierres", icon: History },
  { href: "/ventas", label: "Ventas Diarias", icon: ShoppingCart },
  { href: "/creditos", label: "Créditos", icon: CreditCard },
  { href: "/nos-debe", label: "Nos Debe", icon: HandCoins },
  { href: "/compras", label: "Compras", icon: Truck },
  { href: "/facturacion", label: "Facturación DIAN", icon: Receipt },
  { href: "/historial", label: "Historial de Ventas", icon: BookOpen },
  { href: "/historial-precios", label: "Historial de Precios", icon: TrendingUp },
  { href: "/clientes", label: "Clientes", icon: Users },
];

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();

  return (
    <div className="flex flex-col w-64 h-screen bg-card border-r border-border"
      style={{ minHeight: "100dvh" }}>
      <div className="p-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-lg">
              I
            </div>
            Investi<span className="text-foreground">llo</span>
          </h1>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight pl-10">Gestión con estilo y sencillo</p>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-2 px-4">
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
                isActive 
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
      
      <div className="p-4 border-t border-border">
        <button className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
          <LogOut className="w-5 h-5" />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </div>
  );
}
