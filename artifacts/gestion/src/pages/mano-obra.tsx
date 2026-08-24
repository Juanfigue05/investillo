import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useGetTrabajadores, useCrearTrabajador } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Users, Plus, Pencil, X, Check, ShieldCheck, Calendar, Clock, Wallet } from "lucide-react";
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

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [perfilForm, setPerfilForm] = useState<PerfilForm | null>(null);
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

  const [pagos, setPagos] = useState<PagoSeguro[]>([]);
  const [cargandoPagos, setCargandoPagos] = useState(false);
  const [nuevoPagoFecha, setNuevoPagoFecha] = useState("");
  const [nuevoPagoMonto, setNuevoPagoMonto] = useState("");
  const [registrandoPago, setRegistrandoPago] = useState(false);

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["/api/trabajadores"] });

  const handleAddTrab = () => {
    if (!newTrabNombre.trim()) return;
    crearTrabMutation.mutate(
      { data: { nombre: newTrabNombre.trim(), descuentoSeguro: 0, descuentoOtros: 0, aplicaSeguro: newTrabAplicaSeguro } as any },
      { onSuccess: () => { invalidar(); setShowAddTrab(false); setNewTrabNombre(""); setNewTrabAplicaSeguro(false); } }
    );
  };

  const abrirTarjeta = (t: any) => {
    if (expandedId === t.id) { setExpandedId(null); return; }
    setExpandedId(t.id);
    setPerfilForm({
      nombre: t.nombre,
      numeroSeguro: t.numeroSeguro || "",
      telefono: t.telefono || "",
      correo: t.correo || "",
      eps: t.eps || "",
      aplicaSeguro: Boolean(t.aplicaSeguro),
      fechaProximoPagoSeguro: t.fechaProximoPagoSeguro || "",
    });
    if (t.aplicaSeguro) cargarPagos(t.id);
  };

  const cargarPagos = async (trabajadorId: number) => {
    setCargandoPagos(true);
    try {
      const res = await fetch(`${API}/trabajadores/${trabajadorId}/pagos-seguro`);
      setPagos(await res.json());
    } catch {
      setPagos([]);
    } finally {
      setCargandoPagos(false);
    }
  };

  const guardarPerfil = async (id: number) => {
    if (!perfilForm) return;
    setGuardandoPerfil(true);
    try {
      await fetch(`${API}/trabajadores/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(perfilForm),
      });
      invalidar();
      if (perfilForm.aplicaSeguro) cargarPagos(id);
    } finally {
      setGuardandoPerfil(false);
    }
  };

  const registrarPago = async (trabajadorId: number) => {
    if (!nuevoPagoFecha || !nuevoPagoMonto) return;
    setRegistrandoPago(true);
    try {
      await fetch(`${API}/trabajadores/${trabajadorId}/pagos-seguro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: nuevoPagoFecha, monto: parseFloat(nuevoPagoMonto) }),
      });
      setNuevoPagoFecha(""); setNuevoPagoMonto("");
      invalidar();
      cargarPagos(trabajadorId);
    } finally {
      setRegistrandoPago(false);
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {trabajadores?.map((t: any) => {
              const abierto = expandedId === t.id;
              const dias = diasRestantes(t.fechaProximoPagoSeguro);

              return (
                <div key={t.id} className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
                  <button onClick={() => abrirTarjeta(t)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors">
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
                    <Pencil className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </button>

                  {abierto && perfilForm && (
                    <div className="border-t border-border p-4 space-y-4 animate-in fade-in">
                      {/* ── Perfil ── */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Nombre</label>
                          <input value={perfilForm.nombre} onChange={(e) => setPerfilForm({ ...perfilForm, nombre: e.target.value })}
                            className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Teléfono</label>
                          <input value={perfilForm.telefono} onChange={(e) => setPerfilForm({ ...perfilForm, telefono: e.target.value })}
                            className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Correo</label>
                          <input value={perfilForm.correo} onChange={(e) => setPerfilForm({ ...perfilForm, correo: e.target.value })}
                            className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">EPS</label>
                          <input value={perfilForm.eps} onChange={(e) => setPerfilForm({ ...perfilForm, eps: e.target.value })}
                            className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Número de seguro</label>
                          <input value={perfilForm.numeroSeguro} onChange={(e) => setPerfilForm({ ...perfilForm, numeroSeguro: e.target.value })}
                            className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input type="checkbox" checked={perfilForm.aplicaSeguro} onChange={(e) => setPerfilForm({ ...perfilForm, aplicaSeguro: e.target.checked })} className="accent-primary" />
                        Aplica descuento de seguro
                      </label>

                      <button onClick={() => guardarPerfil(t.id)} disabled={guardandoPerfil}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors text-sm disabled:opacity-50">
                        <Check className="w-4 h-4" /> {guardandoPerfil ? "Guardando..." : "Guardar perfil"}
                      </button>

                      {/* ── Seguro ── */}
                      {perfilForm.aplicaSeguro && (
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
                            <input type="date" value={perfilForm.fechaProximoPagoSeguro}
                              onChange={(e) => setPerfilForm({ ...perfilForm, fechaProximoPagoSeguro: e.target.value })}
                              className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                          </div>

                          <div className="bg-background rounded-xl border border-border p-3 space-y-2">
                            <p className="text-xs font-medium text-foreground">Registrar pago realizado</p>
                            <div className="flex gap-2">
                              <input type="date" value={nuevoPagoFecha} onChange={(e) => setNuevoPagoFecha(e.target.value)}
                                className="flex-1 bg-card border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" />
                              <input type="number" placeholder="Monto" value={nuevoPagoMonto} onChange={(e) => setNuevoPagoMonto(e.target.value)}
                                className="w-28 bg-card border border-border px-2 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none" />
                              <button onClick={() => registrarPago(t.id)} disabled={registrandoPago}
                                className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
                                Registrar
                              </button>
                            </div>
                          </div>

                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1.5">Historial de pagos</p>
                            {cargandoPagos ? (
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
                  )}
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