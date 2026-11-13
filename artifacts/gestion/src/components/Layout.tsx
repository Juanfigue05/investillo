import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { Sidebar } from "./Sidebar";
import { FloatingNotepad } from "./FloatingNotepad";
import { FloatingPriceCheck } from "./FloatingPriceCheck";
import { Bell, Menu, MoreHorizontal, X, CheckCheck, Trash2, Check, Pin, PinOff, Zap, Hand } from "lucide-react";
import { getGetAlertasStockQueryKey, useGetAlertasStock } from "@workspace/api-client-react";
import { BackupLocal } from "./BackupLocal";
import { ConnectionStatus } from "./ConnectionStatus";
import { GlobalSearchDialog } from "./GlobalSearchDialog";
import { CalculadoraCierre } from "./CalculadoraCierre";
import { Calculator as CalcIcon } from "lucide-react";
import { UserMenu } from "./UserMenu";
import { RelojColombia } from "./RelojColombia";
import { fechaHoyColombia } from "@/lib/utils";
import { ManoObraSelector, calcularDistribucion } from "@/components/ManoObraSelector";
import { hayGetsApiActivos, suscribirGetsApi } from "@/lib/api-request-tracker";
import { queryClient } from "@/lib/queryClient";
import {
  esOperacionEncoladaOffline,
  esOperacionOfflineNoGuardada,
  leerRespuestaApi,
} from "@/lib/respuesta-api";
import {
  CLAVE_FACTURAS_OBRA,
  CLAVE_VALORES_OBRA,
  CLAVE_VEHICULOS_OBRA,
  cargarSugerenciasRecientes,
  cargarTrabajadoresRecientes,
  guardarSugerenciaReciente,
  guardarTrabajadoresRecientes,
  ordenarPorUsoReciente,
} from "@/lib/sugerencias-obra";

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
  const [location] = useLocation();
  const [calcCierreOpen, setCalcCierreOpen] = useState(false);
  const [rutaLista, setRutaLista] = useState<string | null>(null);
  const alertasHabilitadas = rutaLista === location;
  const { data: alertas } = useGetAlertasStock({
    query: {
      queryKey: getGetAlertasStockQueryKey(),
      enabled: alertasHabilitadas,
      refetchInterval: alertasHabilitadas ? 4000 : false,
    },
  });
  const [trabajadores, setTrabajadores] = useState<any[]>([]);

  useEffect(() => {
    let timer: number | undefined;
    setRutaLista(null);
    if (location !== "/") {
      void queryClient.cancelQueries({ queryKey: getGetAlertasStockQueryKey() });
    }
    const habilitarCuandoEsteLibre = () => {
      if (hayGetsApiActivos()) {
        if (timer !== undefined) window.clearTimeout(timer);
        timer = undefined;
        return;
      }
      if (timer !== undefined) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        if (!hayGetsApiActivos()) setRutaLista(location);
      }, 150);
    };
    const unsubscribe = suscribirGetsApi(habilitarCuandoEsteLibre);
    habilitarCuandoEsteLibre();
    return () => {
      unsubscribe();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [location]);

  const [showTensionada, setShowTensionada] = useState(false);
  const [tensionadaFecha, setTensionadaFecha] = useState("");
  const [tensionadaValor, setTensionadaValor] = useState("");
  const [guardandoTensionada, setGuardandoTensionada] = useState(false);
  const [errorTensionada, setErrorTensionada] = useState("");
  const [showObraElectronica, setShowObraElectronica] = useState(false);
  const [obraFecha, setObraFecha] = useState(fechaHoyColombia());
  const [obraTrabajadoresSeleccionados, setObraTrabajadoresSeleccionados] = useState<number[]>([]);
  const [obraValoresFijados, setObraValoresFijados] = useState<Record<number, number>>({});
  const [obraNumeroFactura, setObraNumeroFactura] = useState("");
  const [obraVehiculo, setObraVehiculo] = useState("");
  const [obraValor, setObraValor] = useState("");
  const [mostrarObraFactura, setMostrarObraFactura] = useState(false);
  const [facturasObraRecientes, setFacturasObraRecientes] = useState(() => cargarSugerenciasRecientes(CLAVE_FACTURAS_OBRA));
  const [vehiculosObraRecientes, setVehiculosObraRecientes] = useState(() => cargarSugerenciasRecientes(CLAVE_VEHICULOS_OBRA));
  const [valoresObraRecientes, setValoresObraRecientes] = useState(() => cargarSugerenciasRecientes(CLAVE_VALORES_OBRA));
  const [trabajadoresObraRecientes, setTrabajadoresObraRecientes] = useState(cargarTrabajadoresRecientes);
  const [guardandoObra, setGuardandoObra] = useState(false);
  const [obraError, setObraError] = useState("");

  useEffect(() => {
    if (!showObraElectronica || !alertasHabilitadas) return;
    fetch(`${import.meta.env.BASE_URL}api/trabajadores`.replace(/\/+/g, "/"))
      .then((res) => res.json())
      .then(setTrabajadores)
      .catch(() => setTrabajadores([]));
  }, [showObraElectronica, alertasHabilitadas]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
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
  const trabajadoresDisponiblesObra = ordenarPorUsoReciente(
    trabajadores.filter((t) => t.obraElectronica && t.activo !== false),
    trabajadoresObraRecientes,
  );

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

  const guardarValoresRecientesObra = () => {
    setFacturasObraRecientes(
      guardarSugerenciaReciente(CLAVE_FACTURAS_OBRA, obraNumeroFactura, facturasObraRecientes),
    );
    setVehiculosObraRecientes(
      guardarSugerenciaReciente(CLAVE_VEHICULOS_OBRA, obraVehiculo, vehiculosObraRecientes),
    );
    setValoresObraRecientes(
      guardarSugerenciaReciente(CLAVE_VALORES_OBRA, obraValor, valoresObraRecientes),
    );
    setTrabajadoresObraRecientes(
      guardarTrabajadoresRecientes(obraTrabajadoresSeleccionados, trabajadoresObraRecientes),
    );
  };

  const guardarTensionada = async () => {
    if (!tensionadaFecha || !tensionadaValor) return;
    setGuardandoTensionada(true);
    setErrorTensionada("");
    try {
      await leerRespuestaApi(fetch("/api/tensionadas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: tensionadaFecha, valor: parseFloat(tensionadaValor) }),
      }));
      setShowTensionada(false);
      setTensionadaFecha("");
      setTensionadaValor("");
    } catch (error) {
      if (esOperacionEncoladaOffline(error)) {
        setShowTensionada(false);
        setTensionadaFecha("");
        setTensionadaValor("");
        return;
      }
      if (esOperacionOfflineNoGuardada(error)) return;
      setErrorTensionada(error instanceof Error ? error.message : String(error));
    } finally {
      setGuardandoTensionada(false);
    }
  };

  const guardarObraElectronica = async () => {
    setObraError("");
    if (obraTrabajadoresSeleccionados.length === 0 || !obraFecha || !obraVehiculo.trim() || !obraValor.trim()) {
      setObraError("Selecciona al menos un trabajador y completa fecha, vehículo y valor.");
      return;
    }
    const textoValor = obraValor.trim().replace(/\s/g, "").replace(",", ".");
    const valorIngresado = Number(textoValor);
    if (!Number.isFinite(valorIngresado) || valorIngresado <= 0) {
      setObraError("El valor debe ser mayor que cero.");
      return;
    }
    const valorTotal = Math.round(valorIngresado < 1000 ? valorIngresado * 1000 : valorIngresado);
    const distribuciones = calcularDistribucion(valorTotal, obraTrabajadoresSeleccionados, obraValoresFijados);
    const valorDistribuido = distribuciones.reduce((suma, distribucion) => suma + distribucion.valor, 0);
    if (Math.round(valorDistribuido * 100) !== Math.round(valorTotal * 100)) {
      setObraError("La suma asignada a los trabajadores debe coincidir con el valor total.");
      return;
    }
    setGuardandoObra(true);
    try {
      await leerRespuestaApi(fetch(`${import.meta.env.BASE_URL}api/obra-electronica`.replace(/\/+/g, "/"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: obraFecha,
          numeroFactura: obraNumeroFactura,
          vehiculo: obraVehiculo,
          valorTotal,
          trabajadores: distribuciones.map(({ trabajadorId, valor }) => ({ trabajadorId, valor })),
        }),
      }));
      guardarValoresRecientesObra();
      setShowObraElectronica(false);
      setObraTrabajadoresSeleccionados([]);
      setObraValoresFijados({});
      setObraNumeroFactura("");
      setObraVehiculo("");
      setObraValor("");
      setMostrarObraFactura(false);
      window.dispatchEvent(new Event("obra-electronica-actualizada"));
    } catch (error) {
      if (esOperacionEncoladaOffline(error)) {
        guardarValoresRecientesObra();
        setShowObraElectronica(false);
        setObraTrabajadoresSeleccionados([]);
        setObraValoresFijados({});
        setObraNumeroFactura("");
        setObraVehiculo("");
        setObraValor("");
        setMostrarObraFactura(false);
        return;
      }
      if (esOperacionOfflineNoGuardada(error)) return;
      setObraError(error instanceof Error ? error.message : "No se pudo guardar");
    } finally {
      setGuardandoObra(false);
    }
  };

  const abrirObraElectronica = () => {
    setObraFecha(fechaHoyColombia());
    setObraTrabajadoresSeleccionados([]);
    setObraValoresFijados({});
    setObraNumeroFactura("");
    setObraVehiculo("");
    setObraValor(valoresObraRecientes[0] || "");
    setMostrarObraFactura(false);
    setObraError("");
    setShowObraElectronica(true);
  };

  return (
    <div className="min-h-screen w-full min-w-0 overflow-x-clip bg-background flex">
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
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 w-full lg:ml-40">
        {/* Header */}
        <header className="relative min-h-[59px] xl:h-[84px] w-full min-w-0 px-3 xl:px-6 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20 flex items-center gap-2 xl:gap-3">
          {/* Mobile hamburger */}
          <button
            className="lg:hidden p-2 rounded-xl hover:bg-muted transition-colors flex-shrink-0"
            aria-label="Abrir navegación"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>

          <h2 className="text-xl font-display font-medium text-foreground truncate hidden xl:block shrink-0">
            Panel de Control
          </h2>
          <span className="text-base font-display font-bold text-primary xl:hidden shrink-0">Investillo</span>

          <div className="hidden xl:block min-w-0">
            <RelojColombia />
          </div>

          <div className="flex items-center gap-1 lg:gap-2 ml-auto shrink-0">
            <GlobalSearchDialog />
            <div className="hidden xl:block"><ConnectionStatus /></div>
            <div className="hidden min-[360px]:flex sm:hidden xl:hidden"><ConnectionStatus compact /></div>
            <div className="hidden sm:block xl:hidden"><ConnectionStatus /></div>
            <button
              onClick={() => setShowTensionada(true)}
              className="hidden xl:flex flex-col items-center justify-center gap-1 w-[67px] h-[67px] rounded-xl hover:bg-muted transition-colors shrink-0"
            >
              <Zap className="w-6 h-6 text-cyan-400" />
              <span className="text-[11px] text-muted-foreground leading-none">Tensión</span>
            </button>
            <button
              onClick={abrirObraElectronica}
              className="hidden xl:flex flex-col items-center justify-center gap-1 w-[67px] h-[67px] rounded-xl hover:bg-muted transition-colors shrink-0"
              aria-label="Registrar obra electrónica"
            >
              <Hand className="w-6 h-6 text-amber-400" />
              <span className="text-[11px] text-muted-foreground leading-none">Obra elec.</span>
            </button>
            <div className="hidden xl:block"><FloatingPriceCheck topbar requestsEnabled={alertasHabilitadas} /></div>
            <div className="hidden xl:block"><FloatingNotepad topbar requestsEnabled={alertasHabilitadas} /></div>
            <div className="hidden xl:block"><BackupLocal topbar /></div>

            <button onClick={() => setCalcCierreOpen(true)} className="hidden xl:flex flex-col items-center justify-center gap-1 w-[67px] h-[67px] rounded-xl hover:bg-muted transition-colors shrink-0" aria-label="Calculadora de cierre">
              <CalcIcon className="w-6 h-6 text-muted-foreground hover:text-foreground transition-colors" />
              <span className="text-[11px] text-muted-foreground leading-none">Cierre</span>
            </button>
            
            <button
              type="button"
              aria-label="Ver alertas de inventario"
              aria-expanded={alertsOpen}
              onClick={() => setAlertsOpen((open) => !open)}
              className="relative flex h-10 w-10 xl:h-[67px] xl:w-[67px] flex-col items-center justify-center gap-1 rounded-xl hover:bg-muted transition-colors cursor-pointer shrink-0"
            >
              <Bell className="w-5 h-5 xl:w-6 xl:h-6 text-muted-foreground hover:text-foreground transition-colors" />
              <span className="hidden xl:block text-[11px] text-muted-foreground leading-none">Alertas</span>
              {alertCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 lg:w-5 lg:h-5 bg-destructive text-destructive-foreground text-[9px] lg:text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  {alertCount > 999 ? "999+" : alertCount}
                </span>
              )}
            </button>
            <UserMenu />
            <button
              type="button"
              aria-label="Acciones rápidas"
              aria-expanded={mobileActionsOpen}
              onClick={() => setMobileActionsOpen((open) => !open)}
              className="flex xl:hidden h-10 w-10 items-center justify-center rounded-xl hover:bg-muted"
            >
              {mobileActionsOpen ? <X className="h-5 w-5" /> : <MoreHorizontal className="h-5 w-5" />}
            </button>

            {showTensionada && createPortal(
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 90 }}>
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
                  {errorTensionada && <p className="text-sm text-destructive">{errorTensionada}</p>}
                  <div className="flex gap-2">
                    <button onClick={guardarTensionada} disabled={guardandoTensionada} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium text-sm disabled:opacity-50">
                      {guardandoTensionada ? "Guardando..." : "Guardar"}
                    </button>
                    <button onClick={() => setShowTensionada(false)} className="px-4 py-2 bg-muted rounded-xl text-sm">Cancelar</button>
                  </div>
                </div>
              </div>,
              document.body,
            )}

            {showObraElectronica && createPortal(
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 90 }}>
                <div className="bg-card border border-amber-500/40 rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                  <h3 className="font-bold text-foreground flex items-center gap-2"><Hand className="w-5 h-5 text-amber-400" /> Obra electrónica</h3>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Trabajadores</label>
                    <ManoObraSelector
                      trabajadores={trabajadoresDisponiblesObra}
                      searchable
                      recentlyUsedIds={trabajadoresObraRecientes}
                      total={(() => {
                        const texto = obraValor.trim().replace(/\s/g, "").replace(",", ".");
                        const numero = Number(texto);
                        return Number.isFinite(numero) && numero > 0 ? Math.round(numero < 1000 ? numero * 1000 : numero) : 0;
                      })()}
                      seleccionados={obraTrabajadoresSeleccionados}
                      fijados={obraValoresFijados}
                      onChangeSeleccionados={setObraTrabajadoresSeleccionados}
                      onChangeFijados={setObraValoresFijados}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Fecha</label>
                    <input type="date" value={obraFecha} onChange={(e) => setObraFecha(e.target.value)} className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm" />
                  </div>
                  <div>
                    <button type="button" aria-expanded={mostrarObraFactura} onClick={() => setMostrarObraFactura((mostrar) => !mostrar)} className="text-xs text-primary hover:underline">
                      {mostrarObraFactura ? "Ocultar número de factura opcional" : "Agregar número de factura (opcional)"}
                    </button>
                    {mostrarObraFactura && (
                      <div className="mt-2">
                        <label className="block text-xs text-muted-foreground mb-1">Número factura</label>
                        <input type="text" value={obraNumeroFactura} list="obra-electronica-facturas-recientes" onChange={(e) => setObraNumeroFactura(e.target.value)} placeholder="Número de factura" className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm" />
                        <datalist id="obra-electronica-facturas-recientes">
                          {facturasObraRecientes.map((factura) => <option key={factura} value={factura} />)}
                        </datalist>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Placa o vehículo</label>
                    <input type="text" value={obraVehiculo} list="obra-electronica-vehiculos-recientes" onChange={(e) => setObraVehiculo(e.target.value)} placeholder="Ej. BTA 123" className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm" />
                    <datalist id="obra-electronica-vehiculos-recientes">
                      {vehiculosObraRecientes.map((vehiculo) => <option key={vehiculo} value={vehiculo} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Valor total mano de obra (12,5 = $12.500)</label>
                    <input type="text" inputMode="decimal" value={obraValor} list="obra-electronica-valores-recientes" onChange={(e) => setObraValor(e.target.value)} placeholder="60 o 12,5" className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm" />
                    <p className="mt-1 text-[10px] text-muted-foreground">Se precarga el último valor usado; puedes cambiarlo.</p>
                    <datalist id="obra-electronica-valores-recientes">
                      {valoresObraRecientes.map((valor) => <option key={valor} value={valor} />)}
                    </datalist>
                  </div>
                  {obraError && <p className="text-sm text-destructive">{obraError}</p>}
                  <div className="flex gap-2">
                    <button onClick={guardarObraElectronica} disabled={guardandoObra} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium text-sm disabled:opacity-50">{guardandoObra ? "Guardando..." : "Guardar"}</button>
                    <button onClick={() => setShowObraElectronica(false)} className="px-4 py-2 bg-muted rounded-xl text-sm">Cancelar</button>
                  </div>
                </div>
              </div>,
              document.body,
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

            <div className="hidden xl:flex w-10 h-10 rounded-full bg-gradient-to-tr from-accent to-primary p-[2px] flex-shrink-0">
              <div className="w-full h-full rounded-full border-2 border-background overflow-hidden bg-muted flex items-center justify-center font-bold text-xs lg:text-sm">
                I
              </div>
            </div>
          </div>
          {mobileActionsOpen && (
            <div className="absolute right-2 top-full z-[75] mt-2 max-h-[calc(100dvh-5rem)] w-[min(360px,calc(100vw-1rem))] overflow-y-auto rounded-2xl border border-border bg-card p-3 shadow-2xl xl:hidden">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setMobileActionsOpen(false); setShowTensionada(true); }}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <Zap className="h-4 w-4 shrink-0 text-cyan-400" />
                  <span>Tensión</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setMobileActionsOpen(false); abrirObraElectronica(); }}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <Hand className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>Obra electrónica</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setMobileActionsOpen(false); setCalcCierreOpen(true); }}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <CalcIcon className="h-4 w-4 shrink-0" />
                  <span>Cierre diario</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setMobileActionsOpen(false); setAlertsOpen(true); }}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <Bell className="h-4 w-4 shrink-0" />
                  <span>Alertas {alertCount > 0 ? `(${alertCount})` : ""}</span>
                </button>
                <div className="col-span-2 flex justify-end gap-1 border-t border-border pt-2">
                  <FloatingPriceCheck topbar requestsEnabled={alertasHabilitadas} />
                  <FloatingNotepad topbar requestsEnabled={alertasHabilitadas} />
                  <BackupLocal topbar />
                </div>
              </div>
            </div>
          )}
        </header>

        <CalculadoraCierre open={calcCierreOpen} requestsEnabled={alertasHabilitadas} onClose={() => setCalcCierreOpen(false)} />

        {/* Main Content */}
        <main className="w-full min-w-0 p-4 lg:p-8 flex-1 overflow-x-hidden">
          {children}
        </main>
      </div>

    </div>
  );
}
