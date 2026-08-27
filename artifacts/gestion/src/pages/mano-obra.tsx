import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useGetTrabajadores, useCrearTrabajador } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Users, Plus, ShieldCheck, Calendar, Clock, Wallet } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");

interface PagoSeguro {
  id: number;
  fecha: string;
  monto: number;
}

interface PerfilForm {
  nombre: string;
  numeroSeguro: string;
  telefono: string;
  correo: string;
  eps: string;
  aplicaSeguro: boolean;
  fechaProximoPagoSeguro: string;
}

function diasRestantes(fecha: string | null): number | null {
  if (!fecha) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const objetivo = new Date(fecha + "T00:00:00");
  return Math.round((objetivo.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

export default function Trabajadores() {
  const { data: trabajadores, isLoading } = useGetTrabajadores();
  const queryClient = useQueryClient();
  const crearTrabMutation = useCrearTrabajador();

  const [showAddTrab, setShowAddTrab] = useState(false);
  const [newTrabNombre, setNewTrabNombre] = useState("");
  const [newTrabAplicaSeguro, setNewTrabAplicaSeguro] = useState(false);

  // Antes había UN solo perfilForm (para el trabajador expandido). Ahora es un mapa: uno por cada trabajador.
  const [perfilForms, setPerfilForms] = useState<Record<number, PerfilForm>>({});
  const [guardandoPerfilId, setGuardandoPerfilId] = useState<number | null>(null);

  // Antes había UNA sola lista de pagos (del trabajador expandido). Ahora es un mapa: uno por cada trabajador.
  const [pagosPorTrabajador, setPagosPorTrabajador] = useState<Record<number, PagoSeguro[]>>({});
  const [cargandoPagosId, setCargandoPagosId] = useState<number | null>(null);
  const [nuevoPagoFecha, setNuevoPagoFecha] = useState<Record<number, string>>({});
  const [nuevoPagoMonto, setNuevoPagoMonto] = useState<Record<number, string>>({});
  const [registrandoPagoId, setRegistrandoPagoId] = useState<number | null>(null);

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["/api/trabajadores"] });

  // Al llegar la lista de trabajadores, arma el formulario de perfil de TODOS de una vez
  // (antes esto solo pasaba para el único trabajador que se hacía clic para expandir).
  useEffect(() => {
    if (!trabajadores) return;
    setPerfilForms((prev) => {
      const nuevos = { ...prev };
      trabajadores.forEach((t: any) => {
        if (!nuevos[t.id]) {
          nuevos[t.id] = {
            nombre: t.nombre,
            numeroSeguro: t.numeroSeguro || "",
            telefono: t.telefono || "",
            correo: t.correo || "",
            eps: t.eps || "",
            aplicaSeguro: Boolean(t.aplicaSeguro),
            fechaProximoPagoSeguro: t.fechaProximoPagoSeguro || "",
          };
        }
      });
      return nuevos;
    });
    trabajadores.forEach((t: any) => {
      if (t.aplicaSeguro && !(t.id in pagosPorTrabajador)) cargarPagos(t.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trabajadores]);

  const handleAddTrab = () => {
    if (!newTrabNombre.trim()) return;
    crearTrabMutation.mutate(
      { data: { nombre: newTrabNombre.trim(), descuentoSeguro: 0, descuentoOtros: 0, aplicaSeguro: newTrabAplicaSeguro } as any },
      { onSuccess: () => { invalidar(); setShowAddTrab(false); setNewTrabNombre(""); setNewTrabAplicaSeguro(false); } }
    );
  };

  const cargarPagos = async (trabajadorId: number) => {
    setCargandoPagosId(trabajadorId);
    try {
      const res = await fetch(`${API}/trabajadores/${trabajadorId}/pagos-seguro`);
      const data = await res.json();
      setPagosPorTrabajador((prev) => ({ ...prev, [trabajadorId]: data }));
    } catch {
      setPagosPorTrabajador((prev) => ({ ...prev, [trabajadorId]: [] }));
    } finally {
      setCargandoPagosId(null);
    }
  };

  const actualizarCampoPerfil = (id: number, cambios: Partial<PerfilForm>) => {
    setPerfilForms((prev) => ({ ...prev, [id]: { ...prev[id], ...cambios } }));
  };

  const guardarPerfil = async (id: number) => {
    const form = perfilForms[id];
    if (!form) return;
    setGuardandoPerfilId(id);
    try {
      await fetch(`${API}/trabajadores/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      invalidar();
      if (form.aplicaSeguro) cargarPagos(id);
    } finally {
      setGuardandoPerfilId(null);
    }
  };

  const registrarPago = async (trabajadorId: number) => {
    const fecha = nuevoPagoFecha[trabajadorId];
    const monto = nuevoPagoMonto[trabajadorId];
    if (!fecha || !monto) return;
    setRegistrandoPagoId(trabajadorId);
    try {
      await fetch(`${API}/trabajadores/${trabajadorId}/pagos-seguro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha, monto: parseFloat(monto) }),
      });
      setNuevoPagoFecha((prev) => ({ ...prev, [trabajadorId]: "" }));
      setNuevoPagoMonto((prev) => ({ ...prev, [trabajadorId]: "" }));
      invalidar();
      cargarPagos(trabajadorId);
    } finally {
      setRegistrandoPagoId(null);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Trabajadores</h1>
            <p className="text-muted-foreground mt-1 text-sm">Perfil de cada trabajador y seguimiento del seguro social.</p>
          </div>
          <button
            onClick={() => { setShowAddTrab(!showAddTrab); setNewTrabNombre(""); setNewTrabAplicaSeguro(false); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 text-sm"
          >
            <Plus className="w-4 h-4" />
            Agregar Trabajador
          </button>
        </div>

        {showAddTrab && (
          <div className="bg-card border border-border rounded-2xl p-5 shadow-xl space-y-3 animate-in fade-in slide-in-from-top-2">
            <input
              autoFocus type="text" placeholder="Nombre del nuevo trabajador"
              value={newTrabNombre} onChange={(e) => setNewTrabNombre(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTrab()}
              className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={newTrabAplicaSeguro} onChange={(e) => setNewTrabAplicaSeguro(e.target.checked)} className="accent-primary" />
              Aplica descuento de seguro
            </label>
            <div className="flex gap-2">
              <button onClick={handleAddTrab} disabled={crearTrabMutation.isPending} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors text-sm">Guardar</button>
              <button onClick={() => setShowAddTrab(false)} className="px-4 py-2 bg-muted text-foreground rounded-xl font-medium hover:bg-muted/80 transition-colors text-sm border border-border">Cancelar</button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground text-sm">Cargando trabajadores...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {trabajadores?.map((t: any) => {
              const form = perfilForms[t.id];
              const dias = diasRestantes(t.fechaProximoPagoSeguro);
              const pagos = pagosPorTrabajador[t.id] || [];

              if (!form) return null;

              return (
                <div key={t.id} className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
                  <div className="w-full flex items-center gap-3 p-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary flex-shrink-0">
                      {t.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm">{t.nombre}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {t.aplicaSeguro && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">
                            <ShieldCheck className="w-3 h-3" /> Seguro activo
                          </span>
                        )}
                        {t.aplicaSeguro && t.seguroSaldoPendiente > 0 && (
                          <span className="text-[10px] font-medium text-amber-400">Saldo: {formatCurrency(t.seguroSaldoPendiente)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border p-4 space-y-4">
                    {/* ── Perfil ── */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Nombre</label>
                        <input value={form.nombre} onChange={(e) => actualizarCampoPerfil(t.id, { nombre: e.target.value })}
                          className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Teléfono</label>
                        <input value={form.telefono} onChange={(e) => actualizarCampoPerfil(t.id, { telefono: e.target.value })}
                          className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Correo</label>
                        <input value={form.correo} onChange={(e) => actualizarCampoPerfil(t.id, { correo: e.target.value })}
                          className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">EPS</label>
                        <input value={form.eps} onChange={(e) => actualizarCampoPerfil(t.id, { eps: e.target.value })}
                          className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Número de seguro</label>
                        <input value={form.numeroSeguro} onChange={(e) => actualizarCampoPerfil(t.id, { numeroSeguro: e.target.value })}
                          className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input type="checkbox" checked={form.aplicaSeguro} onChange={(e) => actualizarCampoPerfil(t.id, { aplicaSeguro: e.target.checked })} className="accent-primary" />
                      Aplica descuento de seguro
                    </label>

                    <button onClick={() => guardarPerfil(t.id)} disabled={guardandoPerfilId === t.id}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors text-sm disabled:opacity-50">
                      {guardandoPerfilId === t.id ? "Guardando..." : "Guardar perfil"}
                    </button>

                    {/* ── Seguro ── */}
                    {form.aplicaSeguro && (
                      <div className="border-t border-border pt-4 space-y-3">
                        <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-emerald-400" /> Seguimiento del seguro
                        </h4>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-background rounded-xl border border-border p-3">
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Wallet className="w-3 h-3" /> Saldo pendiente</p>
                            <p className="text-lg font-bold text-amber-400">{formatCurrency(t.seguroSaldoPendiente)}</p>
                          </div>
                          <div className="bg-background rounded-xl border border-border p-3">
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Próximo pago</p>
                            {dias === null ? (
                              <p className="text-xs text-muted-foreground">Sin fecha definida</p>
                            ) : dias < 0 ? (
                              <p className="text-sm font-bold text-destructive">Atrasado {Math.abs(dias)} día{Math.abs(dias) === 1 ? "" : "s"}</p>
                            ) : dias === 0 ? (
                              <p className="text-sm font-bold text-amber-400">¡Es hoy!</p>
                            ) : (
                              <p className="text-sm font-bold text-foreground">Faltan {dias} día{dias === 1 ? "" : "s"}</p>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Fecha del próximo pago a la entidad</label>
                          <input type="date" value={form.fechaProximoPagoSeguro}
                            onChange={(e) => actualizarCampoPerfil(t.id, { fechaProximoPagoSeguro: e.target.value })}
                            className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                        </div>

                        <div className="bg-background rounded-xl border border-border p-3 space-y-2">
                          <p className="text-xs font-medium text-foreground">Registrar pago realizado</p>
                          <div className="flex gap-2">
                            <input type="date" value={nuevoPagoFecha[t.id] || ""} onChange={(e) => setNuevoPagoFecha((prev) => ({ ...prev, [t.id]: e.target.value }))}
                              className="flex-1 bg-card border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" />
                            <input type="number" placeholder="Monto" value={nuevoPagoMonto[t.id] || ""} onChange={(e) => setNuevoPagoMonto((prev) => ({ ...prev, [t.id]: e.target.value }))}
                              className="w-28 bg-card border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" />
                            <button onClick={() => registrarPago(t.id)} disabled={registrandoPagoId === t.id}
                              className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
                              Registrar
                            </button>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5">Historial de pagos</p>
                          {cargandoPagosId === t.id ? (
                            <p className="text-xs text-muted-foreground">Cargando...</p>
                          ) : pagos.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Sin pagos registrados todavía.</p>
                          ) : (
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {pagos.map((p) => (
                                <div key={p.id} className="flex justify-between text-xs bg-background rounded-lg px-2.5 py-1.5 border border-border">
                                  <span className="text-muted-foreground">{new Date(p.fecha + "T12:00:00").toLocaleDateString("es-CO")}</span>
                                  <span className="font-medium text-foreground">{formatCurrency(p.monto)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && (!trabajadores || trabajadores.length === 0) && (
          <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay trabajadores registrados todavía.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}