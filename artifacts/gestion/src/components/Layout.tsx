import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { FloatingNotepad } from "./FloatingNotepad";
import { Bell, Menu } from "lucide-react";
import { useGetAlertasStock } from "@workspace/api-client-react";
import { Link } from "wouter";

export function Layout({ children }: { children: React.ReactNode }) {
  const { data: alertas } = useGetAlertasStock({}, { refetchInterval: 4000 });
  const alertCount = alertas?.length || 0;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar: fixed on desktop, drawer on mobile */}
      <div
        className={`fixed left-0 top-0 h-screen z-40 transform transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 lg:h-20 px-4 lg:px-8 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20 flex items-center justify-between gap-4">
          {/* Mobile hamburger */}
          <button
            className="lg:hidden p-2 rounded-xl hover:bg-muted transition-colors flex-shrink-0"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>

          <h2 className="text-base lg:text-xl font-display font-medium text-foreground truncate hidden sm:block">
            Panel de Control
          </h2>
          <span className="text-base font-display font-bold text-primary sm:hidden">Investillo</span>

          <div className="flex items-center gap-3 ml-auto">
            <Link
              href="/inventario"
              className="relative p-2 rounded-full hover:bg-muted transition-colors cursor-pointer block"
            >
              <Bell className="w-5 h-5 lg:w-6 lg:h-6 text-muted-foreground hover:text-foreground transition-colors" />
              {alertCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 lg:w-5 lg:h-5 bg-destructive text-destructive-foreground text-[9px] lg:text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  {alertCount}
                </span>
              )}
            </Link>

            <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-gradient-to-tr from-accent to-primary p-[2px] flex-shrink-0">
              <div className="w-full h-full rounded-full border-2 border-background overflow-hidden bg-muted flex items-center justify-center font-bold text-xs lg:text-sm">
                I
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="p-4 lg:p-8 flex-1 overflow-x-hidden">
          {children}
        </main>
      </div>

      <FloatingNotepad />
    </div>
  );
}
