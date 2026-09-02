import {  Edit2, AlertCircle, ChevronsUpDown, Filter, ChevronDown as ChevDown, Upload, CheckCircle2, Loader2, FileDown, GitMerge } from "lucide-react";
import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import {
  useGetClientes,
  useCrearCliente,
  useActualizarCliente,
  useEliminarCliente,
  useAgregarVehiculo,
  useActualizarVehiculo,
  useEliminarVehiculo,
  type Cliente,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatTelefono, soloDigitos } from "@/lib/utils";
import { Plus, Search, X, Pencil, Trash2, Car, User, Phone, Mail, ChevronDown, ChevronUp, Check } from "lucide-react";
import { encolarOperacion } from "@/lib/offline-db";
import { toast } from "@/hooks/use-toast";
import { esFalloDeRed } from "@/lib/offline-db";

function agregarFilaOptimista(queryClient: any, queryKey: readonly unknown[], fila: any) {
  const idTemporal = -Date.now() - Math.random();
  queryClient.setQueryData(queryKey, (old: any[] = []) => [...(old || []), { id: idTemporal, ...fila, _pendiente: true }]);
}

interface VehiculoForm {
  id?: number;
  placa: string;
  descripcion: string;
}

const emptyForm = { nombre: "", telefono: "", correo: "", notas: "" };
const emptyVeh: VehiculoForm = { placa: "", descripcion: "" };

export default function Clientes() {
  const queryClient = useQueryClient();
  const { data: clientes, isLoading } = useGetClientes({});

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [vehiculos, setVehiculos] = useState<VehiculoForm[]>([]);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [busqueda, setBusqueda] = useState("");

  // Expanded vehicle detail per client card
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Inline vehicle editing on an existing client (not in create form)
  const [vehiculoForm, setVehiculoForm] = useState<{ clienteId: number; veh: VehiculoForm } | null>(null);
  const [editingVehId, setEditingVehId] = useState<number | null>(null);

  const crearMutation = useCrearCliente();
  const actualizarMutation = useActualizarCliente();
  const eliminarMutation = useEliminarCliente();
  const agregarVehiculoMutation = useAgregarVehiculo();
  const actualizarVehiculoMutation = useActualizarVehiculo();
  const eliminarVehiculoMutation = useEliminarVehiculo();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/clientes"] });

  // ── Helpers ──────────────────────────────────────────────────────
  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Create / Edit form ───────────────────────────────────────────
  const openNew = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setVehiculos([{ ...emptyVeh }]);
    setFormErrors([]);
    setShowForm(true);
  };

  const openEdit = (c: Cliente) => {
    setEditingId(c.id);
    setForm({ nombre: c.nombre, telefono: c.telefono ?? "", correo: c.correo ?? "", notas: c.notas ?? "" });
    setVehiculos([]);
    setFormErrors([]);
    setShowForm(true);
  };

  const addVehRow = () => setVehiculos((prev) => [...prev, { ...emptyVeh }]);
  const removeVehRow = (i: number) => setVehiculos((prev) => prev.filter((_, idx) => idx !== i));
  const updateVehRow = (i: number, field: keyof VehiculoForm, val: string) =>
    setVehiculos((prev) => prev.map((v, idx) => (idx === i ? { ...v, [field]: val } : v)));

  const handleGuardar = () => {
    const errors: string[] = [];
    if (!form.nombre.trim()) errors.push("El nombre es obligatorio");
    if (errors.length) { setFormErrors(errors); return; }
    setFormErrors([]);

    const vehs = vehiculos.filter((v) => v.placa.trim());

    const options = {
      onSuccess: () => { invalidate(); setShowForm(false); setEditingId(null); setForm({ ...emptyForm }); setVehiculos([]); },
    };

    if (editingId) {
      actualizarMutation.mutate(
        { id: editingId, data: { nombre: form.nombre.trim(), telefono: form.telefono || null, correo: form.correo || null, notas: form.notas || null } },
        options,
      );
    } else {
      crearMutation.mutate(
        { data: { nombre: form.nombre.trim(), telefono: form.telefono || null, correo: form.correo || null, notas: form.notas || null, vehiculos: vehs.map((v) => ({ placa: v.placa.trim(), descripcion: v.descripcion || null })) } },
        options,
      );
    }
  };

  const handleEliminar = (id: number, nombre: string) => {
    if (confirm(`¿Eliminar cliente "${nombre}"? Se eliminarán también sus vehículos.`)) {
      eliminarMutation.mutate({ id }, { onSuccess: invalidate });
    }
  };

  // ── Inline vehicle actions on existing client ─────────────────────
  const handleSaveVehiculo = (clienteId: number) => {
    if (!vehiculoForm || !vehiculoForm.veh.placa.trim()) return;
    setFormErrors([]);

    const vehs = vehiculos.filter((v) => v.placa.trim());
    const onGuardadoExitoso = () => { invalidate(); setShowForm(false); setEditingId(null); setForm({ ...emptyForm }); setVehiculos([]); };

    if (editingId) {
      const payload = { nombre: form.nombre.trim(), telefono: form.telefono || null, correo: form.correo || null, notas: form.notas || null };
      actualizarMutation.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: onGuardadoExitoso,
          onError: async () => {
            if (!esFalloDeRed(Error)) {
              toast({ title: "No se pudo guardar", description: Error instanceof Error ? Error.message : String(Error), variant: "destructive" });
              return;
            }
            await encolarOperacion({ tipo: "cliente", metodo: "PUT", endpoint: `/clientes/${editingId}`, payload });
            toast({ title: "Guardado sin conexión", description: "Este cliente se sincronizará automáticamente cuando vuelva internet." });
            onGuardadoExitoso();
          },
        },
      );
    } else {
      const payload = { nombre: form.nombre.trim(), telefono: form.telefono || null, correo: form.correo || null, notas: form.notas || null, vehiculos: vehs.map((v) => ({ placa: v.placa.trim(), descripcion: v.descripcion || null })) };

      agregarFilaOptimista(queryClient, ["/api/clientes", {}], { nombre: payload.nombre, telefono: payload.telefono, correo: payload.correo, notas: payload.notas });

      crearMutation.mutate(
        { data: payload },
        {
          onSuccess: onGuardadoExitoso,
          onError: async (error) => {
                      if (!esFalloDeRed(error)) {
                        toast({ title: "No se pudo guardar", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
                        return;
                      }
            await encolarOperacion({ tipo: "cliente", metodo: "POST", endpoint: "/clientes", payload });
            toast({ title: "Guardado sin conexión", description: "Este cliente se sincronizará automáticamente cuando vuelva internet." });
            onGuardadoExitoso();
          },
        },
      );
    }
  };

  const handleEliminarVehiculo = (clienteId: number, vid: number) => {
    if (confirm("¿Eliminar este vehículo?")) {
      eliminarVehiculoMutation.mutate({ id: clienteId, vid }, { onSuccess: invalidate });
    }
  };

  // ── Filtering ────────────────────────────────────────────────────
  const q = busqueda.toLowerCase();
  const filtered = useMemo(() => {
    if (!clientes) return [];
    if (!q) return clientes;
    return clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        (soloDigitos(q).length > 0 && soloDigitos(c.telefono).includes(soloDigitos(q))) ||
        (c.correo ?? "").toLowerCase().includes(q) ||
        c.vehiculos.some((v) => v.placa.toLowerCase().includes(q) || (v.descripcion ?? "").toLowerCase().includes(q)),
    );
  }, [clientes, q]);

  const isSaving = crearMutation.isPending || actualizarMutation.isPending;

  interface ImportResultCliente {
  ok: boolean;
  total: number;
  procesados: number;
  omitidos: number;
  duplicados: number;
  error?: string;
}

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");

// dentro del componente:
const [importandoClientes, setImportandoClientes] = useState(false);
const [importResultClientes, setImportResultClientes] = useState<ImportResultCliente | null>(null);

const handleImportClientes = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  setImportandoClientes(true);
  setImportResultClientes(null);
  try {
    const form = new FormData();
    form.append("archivo", file);
    const res = await fetch(`${API}/clientes-import`, { method: "POST", body: form });
    const data: ImportResultCliente = await res.json();
    setImportResultClientes(data);
    if (data.ok) queryClient.invalidateQueries({ queryKey: ["clientes"] });
  } catch (err) {
    setImportResultClientes({ ok: false, total: 0, procesados: 0, omitidos: 0, duplicados: 0, error: String(err) });
  } finally {
    setImportandoClientes(false);
    e.target.value = "";
  }
};


  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Clientes</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {clientes ? `${clientes.length} cliente${clientes.length === 1 ? "" : "s"} registrado${clientes.length === 1 ? "" : "s"}` : "Cargando..."}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <a href={`${API}/clientes-import/template`}
              download="plantilla_clientes.xlsx"
              className="flex items-center gap-2 px-4 py-2.5 bg-muted text-foreground rounded-xl font-medium hover:bg-muted/80 transition-all text-sm"
            >
              <FileDown className="w-4 h-4 text-green-400" />
              Descargar plantilla
            </a>

            <label className="flex items-center gap-2 px-4 py-2.5 bg-muted text-foreground rounded-xl font-medium hover:bg-muted/80 transition-all text-sm cursor-pointer">
              {importandoClientes 
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</>
                : <><Upload className="w-4 h-4 text-primary" /> Importar Excel</>}
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImportClientes}
                disabled={importandoClientes}
                className="hidden"
              />
            </label>

            <button
              onClick={openNew}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-lg text-sm"
            >
              <Plus className="w-4 h-4" /> Nuevo Cliente
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nombre, teléfono, correo o placa..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 bg-card border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
          />
          {importResultClientes && (
            <div className={`rounded-xl p-4 border ${importResultClientes.ok ? "bg-emerald-500/10 border-emerald-500/20" : "bg-destructive/10 border-destructive/20"}`}>
              {importResultClientes.ok ? (
                <p className="text-sm">
                  <strong>{importResultClientes.procesados}</strong> clientes importados
                  {importResultClientes.duplicados > 0 && ` · ${importResultClientes.duplicados} duplicados omitidos`}
                  {importResultClientes.omitidos > 0 && ` · ${importResultClientes.omitidos} filas sin nombre omitidas`}
                </p>
              ) : (
                <p className="text-sm text-destructive">{importResultClientes.error}</p>
              )}
            </div>
          )}
          {busqueda && (
            <button onClick={() => setBusqueda("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Create / Edit Form */}
        {showForm && (
          <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-4">
            <div className="px-6 py-4 border-b border-border bg-muted/50 flex justify-between items-center">
              <h3 className="text-lg font-display font-bold">{editingId ? "Editar Cliente" : "Nuevo Cliente"}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6 space-y-5">
              {formErrors.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3">
                  {formErrors.map((e, i) => <p key={i} className="text-destructive text-sm">• {e}</p>)}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    <User className="w-3.5 h-3.5 inline mr-1" />Nombre <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Nombre completo del cliente"
                    className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    <Phone className="w-3.5 h-3.5 inline mr-1" />Teléfono
                  </label>
                  <input
                    type="text"
                    value={form.telefono}
                    onChange={(e) => setForm({ ...form, telefono: formatTelefono(e.target.value) })}
                    placeholder="(310) 420 1761"
                    className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    <Mail className="w-3.5 h-3.5 inline mr-1" />Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={form.correo}
                    onChange={(e) => setForm({ ...form, correo: e.target.value })}
                    placeholder="cliente@correo.com"
                    className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Notas</label>
                  <input
                    type="text"
                    value={form.notas}
                    onChange={(e) => setForm({ ...form, notas: e.target.value })}
                    placeholder="Observaciones opcionales..."
                    className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
                  />
                </div>
              </div>

              {/* Vehicles in form — only shown when creating a new client */}
              {!editingId && (
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    <Car className="w-3.5 h-3.5 inline mr-1" />Vehículos
                  </label>
                  <div className="space-y-2">
                    {vehiculos.map((v, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input
                          type="text"
                          placeholder="Placa / Identificador (ej: GHJ123, MICRO 143 VIACOLTUR)"
                          value={v.placa}
                          onChange={(e) => updateVehRow(i, "placa", e.target.value)}
                          className="flex-1 bg-background border border-border px-3 py-2 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none font-mono"
                        />
                        <input
                          type="text"
                          placeholder="Descripción (opcional)"
                          value={v.descripcion}
                          onChange={(e) => updateVehRow(i, "descripcion", e.target.value)}
                          className="flex-1 bg-background border border-border px-3 py-2 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => removeVehRow(i)}
                          disabled={vehiculos.length === 1}
                          className="p-2 text-muted-foreground hover:text-destructive disabled:opacity-30 rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addVehRow}
                    className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar vehículo
                  </button>
                </div>
              )}
              {editingId && (
                <p className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-4 py-3 flex items-center gap-2">
                  <Car className="w-3.5 h-3.5 flex-shrink-0" />
                  Para gestionar vehículos, usa los controles en la tarjeta del cliente.
                </p>
              )}

              <div className="flex gap-3 justify-end border-t border-border pt-4">
                <button onClick={() => setShowForm(false)} className="px-5 py-2.5 bg-muted text-foreground rounded-xl font-medium text-sm hover:bg-muted/80">
                  Cancelar
                </button>
                <button
                  onClick={handleGuardar}
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 shadow-md"
                >
                  {isSaving ? "Guardando..." : editingId ? "Actualizar Cliente" : "Crear Cliente"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Client list */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Cargando clientes...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-2xl border border-border">
            <User className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              {busqueda ? "Sin resultados para la búsqueda." : "No hay clientes registrados aún."}
            </p>
            {!busqueda && (
              <button onClick={openNew} className="mt-4 text-sm text-primary hover:underline">
                Crear el primer cliente
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((c) => (
              <div key={c.id} className="bg-card border border-border rounded-2xl p-5 shadow-sm flex flex-col gap-3">
                {/* Card header */}
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-foreground truncate text-base">{c.nombre}</h3>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {c.telefono && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {formatTelefono(c.telefono)}
                        </p>
                      )}
                      {c.correo && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                          <Mail className="w-3 h-3" /> {c.correo}
                        </p>
                      )}
                    </div>
                  </div>
                    <div className="flex gap-1 flex-shrink-0">
                    {(c as any)._pendiente ? (
                      <span className="text-[10px] text-amber-400 font-medium whitespace-nowrap" title="Guardado local, esperando sincronizar">⏳ Pendiente</span>
                    ) : (
                      <>
                        <button onClick={() => openEdit(c)} className="p-1.5 text-muted-foreground hover:text-primary rounded-lg transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleEliminar(c.id, c.nombre)} className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {c.notas && (
                  <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 italic">{c.notas}</p>
                )}

                {/* Vehicles section */}
                <div className="border-t border-border pt-2">
                  <button
                    onClick={() => toggleExpanded(c.id)}
                    className="flex items-center justify-between w-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <Car className="w-3.5 h-3.5" />
                      {c.vehiculos.length > 0
                        ? `${c.vehiculos.length} vehículo${c.vehiculos.length === 1 ? "" : "s"}`
                        : "Sin vehículos"}
                    </span>
                    {expanded.has(c.id) ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {expanded.has(c.id) && (
                    <div className="mt-2 space-y-1.5 animate-in fade-in">
                      {c.vehiculos.map((v) => (
                        <div key={v.id} className="group flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
                          {editingVehId === v.id && vehiculoForm?.clienteId === c.id ? (
                            <>
                              <input
                                type="text"
                                value={vehiculoForm.veh.placa}
                                onChange={(e) => setVehiculoForm({ clienteId: c.id, veh: { ...vehiculoForm.veh, placa: e.target.value } })}
                                className="flex-1 bg-background border border-border px-2 py-1 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none font-mono"
                                placeholder="Placa"
                                autoFocus
                              />
                              <input
                                type="text"
                                value={vehiculoForm.veh.descripcion}
                                onChange={(e) => setVehiculoForm({ clienteId: c.id, veh: { ...vehiculoForm.veh, descripcion: e.target.value } })}
                                className="flex-1 bg-background border border-border px-2 py-1 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none"
                                placeholder="Descripción"
                              />
                              <button onClick={() => handleSaveVehiculo(c.id)} className="p-1 text-primary hover:text-primary/80">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => { setVehiculoForm(null); setEditingVehId(null); }} className="p-1 text-muted-foreground hover:text-foreground">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="font-mono text-xs font-bold text-foreground flex-shrink-0">{v.placa}</span>
                              {v.descripcion && <span className="text-xs text-muted-foreground truncate flex-1">{v.descripcion}</span>}
                              <div className="flex gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => { setEditingVehId(v.id); setVehiculoForm({ clienteId: c.id, veh: { id: v.id, placa: v.placa, descripcion: v.descripcion ?? "" } }); }}
                                  className="p-1 text-muted-foreground hover:text-primary rounded"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button onClick={() => handleEliminarVehiculo(c.id, v.id)} className="p-1 text-muted-foreground hover:text-destructive rounded">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}

                      {/* Add vehicle inline */}
                      {vehiculoForm?.clienteId === c.id && editingVehId === null ? (
                        <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                          <input
                            type="text"
                            value={vehiculoForm.veh.placa}
                            onChange={(e) => setVehiculoForm({ clienteId: c.id, veh: { ...vehiculoForm.veh, placa: e.target.value } })}
                            className="flex-1 bg-background border border-border px-2 py-1 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none font-mono"
                            placeholder="Placa / Identificador"
                            autoFocus
                          />
                          <input
                            type="text"
                            value={vehiculoForm.veh.descripcion}
                            onChange={(e) => setVehiculoForm({ clienteId: c.id, veh: { ...vehiculoForm.veh, descripcion: e.target.value } })}
                            className="flex-1 bg-background border border-border px-2 py-1 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none"
                            placeholder="Descripción"
                          />
                          <button onClick={() => handleSaveVehiculo(c.id)} className="p-1 text-primary hover:text-primary/80">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setVehiculoForm(null)} className="p-1 text-muted-foreground hover:text-foreground">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setVehiculoForm({ clienteId: c.id, veh: { ...emptyVeh } }); setEditingVehId(null); }}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors w-full px-3 py-1"
                        >
                          <Plus className="w-3 h-3" /> Agregar vehículo
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
