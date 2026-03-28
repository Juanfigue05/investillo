import { Sidebar } from "./Sidebar";
import { FloatingNotepad } from "./FloatingNotepad";
import { Bell } from "lucide-react";
import { useGetAlertasStock } from "@workspace/api-client-react";
import { Link } from "wouter";

export function Layout({ children }: { children: React.ReactNode }) {
  const { data: alertas } = useGetAlertasStock();
  const alertCount = alertas?.length || 0;

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <div className="flex-1 ml-64 flex flex-col">
        {/* Header */}
        <header className="h-20 px-8 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-30 flex items-center justify-between">
          <h2 className="text-xl font-display font-medium text-foreground">
            Panel de Control
          </h2>
          
          <div className="flex items-center gap-4">
            <Link href="/inventario" className="relative p-2 rounded-full hover:bg-muted transition-colors cursor-pointer block">
              <Bell className="w-6 h-6 text-muted-foreground hover:text-foreground transition-colors" />
              {alertCount > 0 && (
                <span className="absolute top-1 right-1 w-5 h-5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  {alertCount}
                </span>
              )}
            </Link>
            
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-accent to-primary p-[2px]">
              <div className="w-full h-full rounded-full border-2 border-background overflow-hidden bg-muted flex items-center justify-center font-bold text-sm">
                AD
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="p-8 flex-1">
          {children}
        </main>
      </div>

      <FloatingNotepad />
    </div>
  );
}
