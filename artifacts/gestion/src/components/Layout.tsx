import { useState, useEffect, useRef } from "react";
import { Sidebar } from "./Sidebar";
import { FloatingNotepad } from "./FloatingNotepad";
import { FloatingPriceCheck } from "./FloatingPriceCheck";
import { Bell, Menu, X, CheckCheck, Trash2, Check, Pin, PinOff, Zap } from "lucide-react";
import { getGetAlertasStockQueryKey, useGetAlertasStock } from "@workspace/api-client-react";
import { BackupLocal } from "./BackupLocal";
import { ConnectionStatus } from "./ConnectionStatus";
import { CalculadoraCierre } from "./CalculadoraCierre";
import { Calculator as CalcIcon } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

// ─── localStorage helpers ─────────────────────────────────────────────────────
function loadSet(key: string): Set<number> {
  try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); }
  catch { return new Set(); }
}
function saveSet(key: string, s: Set<number>) {
  localStorage.setItem(key, JSON.stringify([...s]));
}

const KEYS = { read: "alertas_read", dismissed: "alertas_dismissed", pinned: "alertas_pinned" };

export function Layout({ children }: { children: React.ReactNode }) {
  const [calcCierreOpen, setCalcCierreOpen] = useState(false);
  const { data: alertas } = useGetAlertasStock({
    query: { queryKey: getGetAlertasStockQueryKey(), refetchInterval: 4000 },
  });

  const [showTensionada, setShowTensionada] = useState(false);
  const [tensionadaFecha, setTensionadaFecha] = useState("");
  const [tensionadaValor, setTensionadaValor] = useState("");
  const [guardandoTensionada, setGuardandoTensionada] = useState(false);
  const [sidebarExpandido, setSidebarExpandido] = useState(false);
  const collapseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null); 
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [read, setRead] = useState<Set<number>>(() => loadSet(KEYS.read));
  const [dismissed, setDismissed] = useState<Set<number>>(() => loadSet(KEYS.dismissed));
  const [pinned, setPinned] = useState<Set<number>>(() => loadSet(KEYS.pinned));

  // Persist to localStorage whenever state changes
  useEffect(() => { saveSet(KEYS.read, read); }, [read]);
  useEffect(() => { saveSet(KEYS.dismissed, dismissed); }, [dismissed]);
  useEffect(() => { saveSet(KEYS.pinned, pinned); }, [pinned]);

  // Visible alerts = not dismissed, sorted: pinned first → unread → read
  const visible = (alertas ?? [])
    .filter((p) => !dismissed.has(p.id))
    .sort((a, b) => {
      const pa = pinned.has(a.id) ? 0 : 1;
      const pb = pinned.has(b.id) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const ra = read.has(a.id) ? 1 : 0;
      const rb = read.has(b.id) ? 1 : 0;
      return ra - rb;
    });

  const alertCount = visible.length;

  // ── actions ──
  const markRead = (id: number) =>
    setRead((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const dismiss = (id: number) =>
    setDismissed((prev) => { const n = new Set(prev); n.add(id); return n; });

  const togglePin = (id: number) =>
    setPinned((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const markAllRead = () =>
    setRead(new Set((alertas ?? []).map((p) => p.id)));

  const dismissAll = () => {
    setDismissed(new Set((alertas ?? []).map((p) => p.id)));
    setAlertsOpen(false);
  };

  const guardarTensionada = async () => {
    if (!tensionadaFecha || !tensionadaValor) return;
    setGuardandoTensionada(true);
    try {
      await fetch("/api/tensionadas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: tensionadaFecha, valor: parseFloat(tensionadaValor) }),
      });
      setShowTensionada(false);
      setTensionadaFecha("");
      setTensionadaValor("");
    } finally {
      setGuardandoTensionada(false);
    }
  };

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
        <Sidebar
          onClose={() => setSidebarOpen(false)}
          expandido={sidebarExpandido}
          onMouseEnter={() => {
            if (collapseTimeout.current) clearTimeout(collapseTimeout.current);
            setSidebarExpandido(true);
          }}
          onMouseLeave={() => {
            collapseTimeout.current = setTimeout(() => setSidebarExpandido(false), 5000);
          }}
        />
      </div>

      {/* Main content */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${sidebarExpandido ? "lg:ml-64" : "lg:ml-20"}`}>
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
            <ConnectionStatus />
            <button
              onClick={() => setShowTensionada(true)}
              className="flex flex-col items-center justify-center gap-0.5 w-14 py-1.5 rounded-xl hover:bg-muted transition-colors"
            >
              <Zap className="w-5 h-5 text-cyan-400" />
              <span className="text-[9px] text-muted-foreground leading-none">Tensión</span>
            </button>
            <FloatingPriceCheck topbar />   
            <FloatingNotepad topbar />
            <BackupLocal topbar />

            <button onClick={() => setCalcCierreOpen(true)} className="flex flex-col items-center justify-center gap-0.5 w-14 py-1.5 rounded-xl hover:bg-muted transition-colors" aria-label="Calculadora de cierre">
              <CalcIcon className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
              <span className="text-[9px] text-muted-foreground leading-none">Cierre</span>
            </button>
            
            <button
              type="button"
              aria-label="Ver alertas de inventario"
              aria-expanded={alertsOpen}
              onClick={() => setAlertsOpen((open) => !open)}
              className="relative flex flex-col items-center justify-center gap-0.5 w-14 py-1.5 rounded-xl hover:bg-muted transition-colors cursor-pointer"
            >
              <Bell className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
              <span className="text-[9px] text-muted-foreground leading-none">Alertas</span>
              {alertCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 lg:w-5 lg:h-5 bg-destructive text-destructive-foreground text-[9px] lg:text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  {alertCount > 999 ? "999+" : alertCount}
                </span>
              )}
            </button>

            {showTensionada && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 90 }} onClick={() => setShowTensionada(false)}>
                <div className="bg-card border border-cyan-500/40 rounded-2xl shadow-2xl w-full max-w-xs p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
                  <h3 className="font-bold text-foreground">Registrar Tensionada</h3>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Fecha</label>
                    <input type="date" value={tensionadaFecha} onChange={(e) => setTensionadaFecha(e.target.value)}
                      className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Valor</label>
                    <input type="number" value={tensionadaValor} onChange={(e) => setTensionadaValor(e.target.value)}
                      className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={guardarTensionada} disabled={guardandoTensionada} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium text-sm disabled:opacity-50">
                      {guardandoTensionada ? "Guardando..." : "Guardar"}
                    </button>
                    <button onClick={() => setShowTensionada(false)} className="px-4 py-2 bg-muted rounded-xl text-sm">Cancelar</button>
                  </div>
                </div>
              </div>
            )}

            {alertsOpen && (
              <div className="absolute right-4 lg:right-8 top-14 lg:top-16 z-50 w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col">
                {/* Header row */}
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div>
                    <p className="font-semibold text-foreground">Alertas de inventario</p>
                    <p className="text-xs text-muted-foreground">
                      {alertCount
                        ? `${alertCount} producto${alertCount === 1 ? "" : "s"} por revisar`
                        : "Todo está abastecido"}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Cerrar alertas"
                    onClick={() => setAlertsOpen(false)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <ThemeToggle />
                </div>

                {/* Global action buttons */}
                {alertCount > 0 && (
                  <div className="flex gap-2 px-4 py-2 border-b border-border bg-muted/30">
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-muted hover:bg-accent hover:text-accent-foreground transition-colors font-medium flex-1 justify-center"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Marcar todos como leídos
                    </button>
                    <button
                      type="button"
                      onClick={dismissAll}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-muted hover:bg-destructive hover:text-destructive-foreground transition-colors font-medium flex-1 justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Borrar todas
                    </button>
                  </div>
                )}

                {/* Alert list */}
                {alertCount > 0 ? (
                  <div className="max-h-72 overflow-y-auto divide-y divide-border">
                    {visible.map((producto) => {
                      const isRead = read.has(producto.id);
                      const isPinned = pinned.has(producto.id);
                      return (
                        <div
                          key={producto.id}
                          className={`px-4 py-3 group transition-colors ${isRead ? "opacity-50" : ""} ${isPinned ? "bg-primary/5" : ""}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                {isPinned && <Pin className="w-3 h-3 text-primary shrink-0" />}
                                <p className="truncate text-sm font-medium text-foreground">
                                  {producto.nombre}
                                </p>
                              </div>
                              <p className="truncate text-xs text-muted-foreground">
                                {producto.marca || "Sin marca"} · Ref. {producto.referencia || producto.codigo}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">
                              Stock: {producto.stockActual}
                            </span>
                          </div>

                          {/* Per-item action buttons */}
                          <div className="flex gap-1 mt-2">
                            <button
                              type="button"
                              onClick={() => markRead(producto.id)}
                              title={isRead ? "Marcar como no leído" : "Marcar como leído"}
                              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-muted hover:bg-accent hover:text-accent-foreground transition-colors"
                            >
                              <Check className="w-3 h-3" />
                              {isRead ? "No leído" : "Leído"}
                            </button>
                            <button
                              type="button"
                              onClick={() => togglePin(producto.id)}
                              title={isPinned ? "Desfijar" : "Fijar alerta"}
                              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-muted hover:bg-primary/20 hover:text-primary transition-colors"
                            >
                              {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                              {isPinned ? "Desfijar" : "Fijar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => dismiss(producto.id)}
                              title="Borrar alerta"
                              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-muted hover:bg-destructive hover:text-destructive-foreground transition-colors ml-auto"
                            >
                              <Trash2 className="w-3 h-3" />
                              Borrar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No hay productos agotándose.
                  </p>
                )}
              </div>
            )}

            <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-gradient-to-tr from-accent to-primary p-[2px] flex-shrink-0">
              <div className="w-full h-full rounded-full border-2 border-background overflow-hidden bg-muted flex items-center justify-center font-bold text-xs lg:text-sm">
                I
              </div>
            </div>
          </div>
        </header>

        <CalculadoraCierre open={calcCierreOpen} onClose={() => setCalcCierreOpen(false)} />

        {/* Main Content */}
        <main className="p-4 lg:p-8 flex-1 overflow-x-hidden">
          {children}
        </main>
      </div>

    </div>
  );
}
