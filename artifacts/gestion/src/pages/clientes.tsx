import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import {
  esOperacionEncoladaOffline,
  esOperacionOfflineNoGuardada,
  leerRespuestaApi,
} from "@/lib/respuesta-api";
import {
  useGetCreditos,
  useAbonarCredito,
  useGetClientes,
  useCrearCliente,
  useActualizarCliente,
  useEliminarCliente,
  useAgregarVehiculo,
  useActualizarVehiculo,
  useEliminarVehiculo,
  type Cliente,
  type Credito,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  fechaHoyColombia,
  formatCurrency,
  formatTelefono,
  soloDigitos,
} from "@/lib/utils";
import {
  Plus,
  Search,
  X,
  Pencil,
  Trash2,
  Car,
  User,
  Phone,
  Mail,
  ChevronDown,
  ChevronUp,
  Check,
  Upload,
  Loader2,
  FileDown,
  CreditCard,
  CalendarDays,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import {
  encolarOperacion,
  esFalloDeRed,
  obtenerIdOperacionOffline,
} from "@/lib/offline-db";
import { toast } from "@/hooks/use-toast";
import { readDailyIvaPreference } from "@workspace/api-zod";
interface VehiculoForm {
  id?: number;
  placa: string;
  descripcion: string;
}

interface ConflictoTelefono {
  nombre: string;
  telefono?: string | null;
  telefono2?: string | null;
  conflictoTelefono: string;
  conflictoCon: string;
}

interface ImportResultCliente {
  ok: boolean;
  total: number;
  procesados: number;
  omitidos: number;
  duplicados: number;
  conflictosTelefono?: ConflictoTelefono[];
  error?: string;
}

const emptyForm = {
  nombre: "",
  telefono: "",
  telefono2: "",
  correo: "",
  notas: "",
};
const emptyVeh: VehiculoForm = { placa: "", descripcion: "" };

function normalizarNombreCliente(nombre: string): string {
  return nombre.trim().toLocaleLowerCase("es");
}

function obtenerCreditosCliente(
  cliente: Cliente,
  creditos: Credito[],
  clientes: Cliente[],
): Credito[] {
  const nombreNormalizado = normalizarNombreCliente(cliente.nombre);
  const clientesMismoNombre = clientes.filter(
    (item) => normalizarNombreCliente(item.nombre) === nombreNormalizado,
  );
  const telefonosCliente = [cliente.telefono, cliente.telefono2]
    .map((telefono) => soloDigitos(telefono))
    .filter(Boolean);

  return creditos.filter((credito) => {
    if (credito.clienteId === cliente.id) return true;
    if (credito.clienteId != null) return false;
    if (normalizarNombreCliente(credito.nombreCliente) !== nombreNormalizado) {
      return false;
    }
    if (clientesMismoNombre.length === 1) return true;
    const telefonoCredito = soloDigitos(credito.telefonoCliente);
    return Boolean(
      telefonoCredito && telefonosCliente.includes(telefonoCredito),
    );
  });
}

function fechaCuenta(fecha: string | Date): string {
  const fechaIso = String(fecha).slice(0, 10);
  return new Date(`${fechaIso}T12:00:00`).toLocaleDateString("es-CO");
}

/** Renderiza la gestión de clientes, vehículos e importaciones. */
export default function Clientes() {
  const queryClient = useQueryClient();
  const { data: clientes, isLoading } = useGetClientes({});
  const {
    data: creditos,
    isLoading: isLoadingCreditos,
    isError: errorAlCargarCreditos,
    error: errorCreditos,
    refetch: recargarCreditos,
  } = useGetCreditos({ tipo: "credito" });
  const abonarMutation = useAbonarCredito();

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [vehiculos, setVehiculos] = useState<VehiculoForm[]>([]);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [conflictoTelefonoManual, setConflictoTelefonoManual] = useState<{
    numero: string;
    campo: "telefono" | "telefono2";
    clientes: string[];
  } | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [ordenNombre, setOrdenNombre] = useState<
    "az" | "za" | "saldo_desc" | "saldo_asc"
  >("az");
  const [soloSinTelefono, setSoloSinTelefono] = useState(false);
  const [soloConDosTelefonos, setSoloConDosTelefonos] = useState(false);
  const [clienteCuenta, setClienteCuenta] = useState<Cliente | null>(null);
  const [pagoCreditoId, setPagoCreditoId] = useState<number | null>(null);
  const [pagoValor, setPagoValor] = useState("");
  const [pagoNota, setPagoNota] = useState("");

  // Expanded vehicle detail per client card
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Inline vehicle editing on an existing client (not in create form)
  const [vehiculoForm, setVehiculoForm] = useState<{
    clienteId: number;
    veh: VehiculoForm;
  } | null>(null);
  const [editingVehId, setEditingVehId] = useState<number | null>(null);

  const [conflictosTelefono, setConflictosTelefono] = useState<
    ConflictoTelefono[]
  >([]);
  const [resolviendoTelefonos, setResolviendoTelefonos] = useState(false);
  const crearMutation = useCrearCliente();
  const actualizarMutation = useActualizarCliente();
  const eliminarMutation = useEliminarCliente();
  const agregarVehiculoMutation = useAgregarVehiculo();
  const actualizarVehiculoMutation = useActualizarVehiculo();
  const eliminarVehiculoMutation = useEliminarVehiculo();

  /** Refresca la lista de clientes después de una mutación. */
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/clientes"] });

  // ── Helpers ──────────────────────────────────────────────────────
  /** Muestra u oculta los vehículos de una tarjeta. */
  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Create / Edit form ───────────────────────────────────────────
  /** Prepara el formulario para crear un cliente. */
  const openNew = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setVehiculos([{ ...emptyVeh }]);
    setFormErrors([]);
    setShowForm(true);
  };

  /** Prepara el formulario con los datos del cliente seleccionado. */
  const openEdit = (c: Cliente) => {
    setEditingId(c.id);
    setForm({
      nombre: c.nombre,
      telefono: c.telefono ?? "",
      telefono2: (c as any).telefono2 ?? "",
      correo: c.correo ?? "",
      notas: c.notas ?? "",
    });
    setVehiculos([]);
    setFormErrors([]);
    setShowForm(true);
  };

  /** Añade una fila de vehículo al formulario de alta. */
  const addVehRow = () => setVehiculos((prev) => [...prev, { ...emptyVeh }]);
  /** Elimina una fila de vehículo del formulario de alta. */
  const removeVehRow = (i: number) =>
    setVehiculos((prev) => prev.filter((_, idx) => idx !== i));
  /** Actualiza un campo de una fila de vehículo. */
  const updateVehRow = (i: number, field: keyof VehiculoForm, val: string) =>
    setVehiculos((prev) =>
      prev.map((v, idx) => (idx === i ? { ...v, [field]: val } : v)),
    );

  /** Valida y guarda un cliente nuevo o los cambios de uno existente. */
  const handleGuardar = () => {
    const errors: string[] = [];
    if (!form.nombre.trim()) errors.push("El nombre es obligatorio");
    if (errors.length) {
      setFormErrors(errors);
      return;
    }
    const telefonosFormulario = ([
      ["telefono", form.telefono],
      ["telefono2", form.telefono2],
    ] as const).filter(([, numero]) => soloDigitos(numero).length > 0);
    for (const [campo, numero] of telefonosFormulario) {
      const digitos = soloDigitos(numero);
      const clientesConNumero = (clientes || [])
        .filter((c) => c.id !== editingId)
        .filter((c) => [c.telefono, (c as any).telefono2].some((t) => soloDigitos(t).length > 0 && soloDigitos(t) === digitos))
        .map((c) => c.nombre);
      if (clientesConNumero.length > 0) {
        setConflictoTelefonoManual({ numero, campo, clientes: clientesConNumero });
        return;
      }
    }
    if (soloDigitos(form.telefono) && soloDigitos(form.telefono) === soloDigitos(form.telefono2)) {
      setConflictoTelefonoManual({ numero: form.telefono, campo: "telefono2", clientes: ["este mismo cliente"] });
      return;
    }
    setFormErrors([]);

    const vehs = vehiculos.filter((v) => v.placa.trim());

    const options = {
      onSuccess: () => {
        invalidate();
        setShowForm(false);
        setEditingId(null);
        setForm({ ...emptyForm });
        setVehiculos([]);
      },
      onError: (error: unknown) => {
        if (esOperacionEncoladaOffline(error)) {
          invalidate();
          setShowForm(false);
          setEditingId(null);
          setForm({ ...emptyForm });
          setVehiculos([]);
          setFormErrors([]);
          return;
        }
        if (esOperacionOfflineNoGuardada(error)) return;
        setFormErrors([
          error instanceof Error ? error.message : "No se pudo guardar el cliente",
        ]);
      },
    };

    if (editingId) {
      actualizarMutation.mutate(
        {
          id: editingId,
          data: {
            nombre: form.nombre.trim(),
            telefono: form.telefono || null,
            telefono2: form.telefono2 || null,
            correo: form.correo || null,
            notas: form.notas || null,
          },
        },
        options,
      );
    } else {
      crearMutation.mutate(
        {
          data: {
            nombre: form.nombre.trim(),
            telefono: form.telefono || null,
            telefono2: form.telefono2 || null,
            correo: form.correo || null,
            notas: form.notas || null,
            vehiculos: vehs.map((v) => ({
              placa: v.placa.trim(),
              descripcion: v.descripcion || null,
            })),
          },
        },
        options,
      );
    }
  };

  /** Solicita confirmación y elimina un cliente con sus vehículos. */
  const handleEliminar = (id: number, nombre: string) => {
    if (
      confirm(
        `¿Eliminar cliente "${nombre}"? Se eliminarán también sus vehículos.`,
      )
    ) {
      eliminarMutation.mutate({ id }, { onSuccess: invalidate });
    }
  };

  // ── Inline vehicle actions on existing client ─────────────────────
  /** Crea o actualiza el vehículo que se está editando en línea. */
  const handleSaveVehiculo = (clienteId: number) => {
    if (!vehiculoForm || !vehiculoForm.veh.placa.trim()) return;
    const data = {
      placa: vehiculoForm.veh.placa.trim(),
      descripcion: vehiculoForm.veh.descripcion || null,
    };
    const options = {
      onSuccess: () => {
        invalidate();
        setVehiculoForm(null);
        setEditingVehId(null);
      },
    };

    if (editingVehId === null) {
      agregarVehiculoMutation.mutate({ id: clienteId, data }, options);
      return;
    }

    actualizarVehiculoMutation.mutate(
      { id: clienteId, vid: editingVehId, data },
      options,
    );
  };

  /** Solicita confirmación y elimina un vehículo del cliente. */
  const handleEliminarVehiculo = (clienteId: number, vid: number) => {
    if (confirm("¿Eliminar este vehículo?")) {
      eliminarVehiculoMutation.mutate(
        { id: clienteId, vid },
        { onSuccess: invalidate },
      );
    }
  };

  const saldoPendientePorCliente = useMemo(() => {
    const saldos = new Map<number, number>();
    for (const cliente of clientes ?? []) {
      const saldo = obtenerCreditosCliente(
        cliente,
        creditos ?? [],
        clientes ?? [],
      ).reduce(
        (total, credito) => total + Math.max(0, credito.valorRestante),
        0,
      );
      saldos.set(cliente.id, saldo);
    }
    return saldos;
  }, [clientes, creditos]);

  const saldoPendienteTotal = Array.from(
    saldoPendientePorCliente.values(),
  ).reduce((total, saldo) => total + saldo, 0);

  // ── Filtering ────────────────────────────────────────────────────
  const q = busqueda.toLowerCase();
  const filtered = useMemo(() => {
    if (!clientes) return [];
    const resultados = clientes.filter((c) => {
      const tieneTelefono = Boolean(
        c.telefono?.trim() || (c as any).telefono2?.trim(),
      );
      const coincideBusqueda =
        !q ||
        c.nombre.toLowerCase().includes(q) ||
        (soloDigitos(q).length > 0 &&
          (soloDigitos(c.telefono).includes(soloDigitos(q)) ||
            soloDigitos((c as any).telefono2).includes(soloDigitos(q)))) ||
        (c.correo ?? "").toLowerCase().includes(q) ||
        c.vehiculos.some(
          (v) =>
            v.placa.toLowerCase().includes(q) ||
            (v.descripcion ?? "").toLowerCase().includes(q),
        );

      return coincideBusqueda && (!soloSinTelefono || !tieneTelefono);
    }).filter((c) => !soloConDosTelefonos || Boolean(c.telefono?.trim() && (c as any).telefono2?.trim()));

    return resultados.sort((a, b) => {
      if (ordenNombre === "saldo_desc" || ordenNombre === "saldo_asc") {
        const comparacion =
          (saldoPendientePorCliente.get(a.id) ?? 0) -
          (saldoPendientePorCliente.get(b.id) ?? 0);
        if (comparacion !== 0) {
          return ordenNombre === "saldo_desc" ? -comparacion : comparacion;
        }
      }
      const comparacion = a.nombre.localeCompare(b.nombre, "es", {
        sensitivity: "base",
      });
      return ordenNombre === "za" ? -comparacion : comparacion;
    });
  }, [
    clientes,
    q,
    ordenNombre,
    soloSinTelefono,
    soloConDosTelefonos,
    saldoPendientePorCliente,
  ]);

  const creditosCuenta = clienteCuenta
    ? obtenerCreditosCliente(clienteCuenta, creditos ?? [], clientes ?? [])
    : [];
  const creditosPendientesCuenta = creditosCuenta.filter(
    (credito) => credito.valorRestante > 0.01,
  );
  const creditoAbonoSeleccionado =
    creditosPendientesCuenta.find((credito) => credito.id === pagoCreditoId) ??
    creditosPendientesCuenta[0];
  const movimientosCuenta = creditosCuenta
    .flatMap((credito) => [
      {
        id: `credito-${credito.id}`,
        fecha: String(credito.fechaFactura).slice(0, 10),
        tipo: "credito" as const,
        descripcion:
          credito.concepto || credito.descripcion || `Crédito #${credito.id}`,
        valor: credito.valorCredito,
      },
      ...credito.abonos.map((abono) => ({
        id: `abono-${abono.id}`,
        fecha: String(abono.fecha).slice(0, 10),
        tipo: "abono" as const,
        descripcion: abono.notas || `Abono al crédito #${credito.id}`,
        valor: abono.valorTotal,
      })),
    ])
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  const abrirEstadoCuenta = (cliente: Cliente) => {
    const creditosCliente = obtenerCreditosCliente(
      cliente,
      creditos ?? [],
      clientes ?? [],
    );
    const pendienteMayor = creditosCliente
      .filter((credito) => credito.valorRestante > 0.01)
      .sort((a, b) => b.valorRestante - a.valorRestante)[0];
    setClienteCuenta(cliente);
    setPagoCreditoId(pendienteMayor?.id ?? null);
    setPagoValor("");
    setPagoNota("");
  };

  const registrarAbonoCuenta = () => {
    const credito = creditoAbonoSeleccionado;
    const valorIngresado = Number(pagoValor);
    const valor = Math.round(valorIngresado * 100) / 100;
    if (!credito || !Number.isFinite(valor) || valor <= 0) {
      toast({
        title: "Valor inválido",
        description: "Ingresa un valor de abono mayor que cero.",
        variant: "destructive",
      });
      return;
    }
    if (valor > credito.valorRestante + 0.01) {
      toast({
        title: "El abono supera el saldo",
        description: `El saldo de este crédito es ${formatCurrency(credito.valorRestante)}.`,
        variant: "destructive",
      });
      return;
    }

    let restante = Math.round(valor * 100) / 100;
    const lineas: Array<{ lineaId: number; valor: number }> = [];
    for (const linea of credito.lineas) {
      const saldoLinea = Math.max(0, linea.valorRestante);
      const valorLinea = Math.round(Math.min(restante, saldoLinea) * 100) / 100;
      if (valorLinea > 0) {
        lineas.push({ lineaId: linea.id, valor: valorLinea });
        restante = Math.round((restante - valorLinea) * 100) / 100;
      }
      if (restante <= 0.01) break;
    }
    if (lineas.length === 0 || restante > 0.01) {
      toast({
        title: "No se pudo distribuir el abono",
        description: "Verifica que el crédito tenga líneas con saldo pendiente.",
        variant: "destructive",
      });
      return;
    }

    const fecha = fechaHoyColombia();
    const tieneIva = credito.lineas.some(
      (linea) => linea.productoNombre === "IVA (19%)",
    );
    const incluirIvaVentasDiarias =
      tieneIva && readDailyIvaPreference(localStorage)
        ? window.confirm(
            "Este crédito tiene una línea de IVA. ¿Deseas incluirla también en Ventas Diarias?",
          )
        : false;
    const payload = {
      valor,
      lineas,
      fechaAbono: fecha,
      fechaVentaDiaria: fecha,
      customRef: pagoNota.trim() || undefined,
      formaPago: "efectivo",
      registrarIvaVentasDiarias: incluirIvaVentasDiarias,
    };
    const completarAbono = (mensaje: string) => {
      queryClient.invalidateQueries({ queryKey: ["/api/creditos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
      setPagoValor("");
      setPagoNota("");
      toast({ title: mensaje });
    };

    abonarMutation.mutate(
      { id: credito.id, data: payload },
      {
        onSuccess: () => completarAbono("Abono registrado"),
        onError: async (error: unknown) => {
          if (!esFalloDeRed(error)) {
            toast({
              title: "No se pudo registrar el abono",
              description:
                error instanceof Error ? error.message : String(error),
              variant: "destructive",
            });
            return;
          }
          try {
            await encolarOperacion({
              operationId: obtenerIdOperacionOffline(error),
              tipo: "credito",
              metodo: "POST",
              endpoint: `/creditos/${credito.id}/abono`,
              payload,
            });
            completarAbono("Abono guardado sin conexión");
          } catch (errorOffline) {
            toast({
              title: "No se pudo guardar el abono",
              description:
                errorOffline instanceof Error
                  ? errorOffline.message
                  : String(errorOffline),
              variant: "destructive",
            });
          }
        },
      },
    );
  };

  const isSaving = crearMutation.isPending || actualizarMutation.isPending;

  const API = "/api".replace(/\/+/g, "/").replace(/\/$/, "");

  // dentro del componente:
  const [importandoClientes, setImportandoClientes] = useState(false);
  const [importResultClientes, setImportResultClientes] =
    useState<ImportResultCliente | null>(null);

  /** Cambia un teléfono del conflicto seleccionado. */
  const actualizarConflictoTelefono = (
    idx: number,
    campo: "telefono" | "telefono2",
    valor: string,
  ) => {
    setConflictosTelefono((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, [campo]: valor || null } : c)),
    );
  };

  /** Quita un cliente de la lista pendiente de resolución. */
  const omitirConflicto = (idx: number) => {
    setConflictosTelefono((prev) => prev.filter((_, i) => i !== idx));
  };

  /** Envía al servidor los conflictos telefónicos corregidos. */
  const aplicarResolucionTelefonos = async () => {
    setResolviendoTelefonos(true);
    try {
      const res = await fetch(`${API}/clientes-import/resolver-telefonos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: conflictosTelefono }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.conflictosTelefono?.length) {
        setConflictosTelefono(data.conflictosTelefono); // todavía queda algún choque -> lo dejamos para que lo ajuste de nuevo
      } else {
        setConflictosTelefono([]);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/clientes"] });
    } catch (err) {
      if (esOperacionEncoladaOffline(err)) {
        setConflictosTelefono([]);
        queryClient.invalidateQueries({ queryKey: ["/api/clientes"] });
        return;
      }
      if (esOperacionOfflineNoGuardada(err)) return;
      alert("Error al aplicar: " + err);
    } finally {
      setResolviendoTelefonos(false);
    }
  };

  /** Importa clientes desde el archivo Excel seleccionado. */
  const handleImportClientes = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportandoClientes(true);
    try {
      const form = new FormData();
      form.append("archivo", file);
      const data = await leerRespuestaApi<ImportResultCliente>(fetch(`${API}/clientes-import`, {
        method: "POST",
        body: form,
      }));
      if (data.conflictosTelefono?.length) {
        setConflictosTelefono(data.conflictosTelefono);
      }
      setImportResultClientes(data);
      if (data.ok) {
        e.target.value = "";
        queryClient.invalidateQueries({ queryKey: ["/api/clientes"] });
      }
    } catch (err) {
      if (esOperacionEncoladaOffline(err)) {
        e.target.value = "";
        setImportResultClientes(null);
        queryClient.invalidateQueries({ queryKey: ["/api/clientes"] });
        return;
      }
      if (esOperacionOfflineNoGuardada(err)) return;
      setImportResultClientes({
        ok: false,
        total: 0,
        procesados: 0,
        omitidos: 0,
        duplicados: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setImportandoClientes(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">
              Clientes
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {clientes
                ? `${clientes.length} cliente${clientes.length === 1 ? "" : "s"} registrado${clientes.length === 1 ? "" : "s"} · Saldo pendiente: ${
                    isLoadingCreditos
                      ? "cargando..."
                      : errorAlCargarCreditos
                        ? "no disponible"
                        : formatCurrency(saldoPendienteTotal)
                  }`
                : "Cargando..."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`${API}/clientes-import/template`}
              download="plantilla_clientes.xlsx"
              className="flex items-center gap-2 px-4 py-2.5 bg-muted text-foreground rounded-xl font-medium hover:bg-muted/80 transition-all text-sm"
            >
              <FileDown className="w-4 h-4 text-green-400" />
              Descargar plantilla
            </a>

            <label className="flex items-center gap-2 px-4 py-2.5 bg-muted text-foreground rounded-xl font-medium hover:bg-muted/80 transition-all text-sm cursor-pointer">
              {importandoClientes ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Importando...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 text-primary" /> Importar Excel
                </>
              )}
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

        {errorAlCargarCreditos && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm"
          >
            <p className="text-destructive">
              No se pudo cargar el estado de cuenta:{" "}
              {errorCreditos instanceof Error
                ? errorCreditos.message
                : String(errorCreditos)}
            </p>
            <button
              type="button"
              onClick={() => void recargarCreditos()}
              className="rounded-lg border border-destructive/30 px-3 py-1.5 font-medium text-destructive hover:bg-destructive/10"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Search and filters */}
        <div className="flex flex-col lg:flex-row gap-3 lg:items-start">
          <div className="relative max-w-md lg:flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nombre, teléfono, correo o placa..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 bg-card border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
            />
            {conflictosTelefono.length > 0 && (
              <div className="bg-card border border-amber-500/40 rounded-2xl p-5 shadow-xl space-y-4">
                <div>
                  <h3 className="font-bold text-foreground flex items-center gap-2">
                    ⚠️ {conflictosTelefono.length} cliente
                    {conflictosTelefono.length !== 1 ? "s" : ""} con teléfono
                    repetido
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Estos clientes del Excel tienen un número que ya está usado
                    por otro cliente. Corrige o borra el número en conflicto, o
                    quítalo de la lista.
                  </p>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {conflictosTelefono.map((c, idx) => (
                    <div
                      key={idx}
                      className="bg-background border border-border rounded-xl p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-foreground text-sm">
                          {c.nombre}
                        </p>
                        <button
                          onClick={() => omitirConflicto(idx)}
                          className="text-xs text-destructive hover:underline"
                        >
                          No importar este cliente
                        </button>
                      </div>
                      <p className="text-xs text-amber-400">
                        El número <strong>{c.conflictoTelefono}</strong> ya lo
                        tiene registrado <strong>{c.conflictoCon}</strong>.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1">
                            Teléfono 1
                          </label>
                          <input
                            type="text"
                            value={c.telefono || ""}
                            onChange={(e) =>
                              actualizarConflictoTelefono(
                                idx,
                                "telefono",
                                e.target.value,
                              )
                            }
                            className="w-full bg-card border border-border px-2 py-1.5 rounded-lg text-xs"
                            placeholder="Dejar vacío si no aplica"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1">
                            Teléfono 2
                          </label>
                          <input
                            type="text"
                            value={c.telefono2 || ""}
                            onChange={(e) =>
                              actualizarConflictoTelefono(
                                idx,
                                "telefono2",
                                e.target.value,
                              )
                            }
                            className="w-full bg-card border border-border px-2 py-1.5 rounded-lg text-xs"
                            placeholder="Dejar vacío si no aplica"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={aplicarResolucionTelefonos}
                  disabled={resolviendoTelefonos}
                  className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm disabled:opacity-50"
                >
                  {resolviendoTelefonos
                    ? "Aplicando..."
                    : "Importar con estos ajustes"}
                </button>
              </div>
            )}
            {importResultClientes && (
              <div
                className={`rounded-xl p-4 border ${importResultClientes.ok ? "bg-emerald-500/10 border-emerald-500/20" : "bg-destructive/10 border-destructive/20"}`}
              >
                {importResultClientes.ok ? (
                  <p className="text-sm">
                    <strong>{importResultClientes.procesados}</strong> clientes
                    importados
                    {importResultClientes.duplicados > 0 &&
                      ` · ${importResultClientes.duplicados} duplicados omitidos`}
                    {importResultClientes.omitidos > 0 &&
                      ` · ${importResultClientes.omitidos} filas sin nombre omitidas`}
                  </p>
                ) : (
                  <p className="text-sm text-destructive">
                    {importResultClientes.error}
                  </p>
                )}
              </div>
            )}
            {busqueda && (
              <button
                onClick={() => setBusqueda("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-start gap-3 lg:justify-end">
            <label className="flex flex-col gap-1 text-sm text-muted-foreground">
              <span>Ordenar:</span>
              <select
                value={ordenNombre}
                onChange={(e) =>
                  setOrdenNombre(
                    e.target.value as
                      | "az"
                      | "za"
                      | "saldo_desc"
                      | "saldo_asc",
                  )
                }
                className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="az">Nombre A-Z</option>
                <option value="za">Nombre Z-A</option>
                <option value="saldo_desc">Mayor saldo pendiente</option>
                <option value="saldo_asc">Menor saldo pendiente</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer mt-6">
              <input
                type="checkbox"
                checked={soloSinTelefono}
                onChange={(e) => setSoloSinTelefono(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              Solo sin teléfono
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer mt-6">
              <input
                type="checkbox"
                checked={soloConDosTelefonos}
                onChange={(e) => setSoloConDosTelefonos(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              Solo con dos teléfonos
            </label>
          </div>
        </div>

        {/* Create / Edit Form */}
        {showForm && (
          <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-4">
            <div className="px-6 py-4 border-b border-border bg-muted/50 flex justify-between items-center">
              <h3 className="text-lg font-display font-bold">
                {editingId ? "Editar Cliente" : "Nuevo Cliente"}
              </h3>
              <button onClick={() => setShowForm(false)}>
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {formErrors.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3">
                  {formErrors.map((e, i) => (
                    <p key={i} className="text-destructive text-sm">
                      • {e}
                    </p>
                  ))}
                </div>
              )}
              {conflictoTelefonoManual && (
                <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 space-y-3">
                  <p className="text-sm font-semibold text-amber-300">Número repetido</p>
                  <p className="text-sm text-foreground">
                    El número <strong>{conflictoTelefonoManual.numero}</strong> ya aparece en: {conflictoTelefonoManual.clientes.join(", ")}.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setConflictoTelefonoManual(null)} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm">Modificar número</button>
                    <button type="button" onClick={() => { setForm((prev) => ({ ...prev, [conflictoTelefonoManual.campo]: "" })); setConflictoTelefonoManual(null); }} className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted">Dejar sin número</button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    <User className="w-3.5 h-3.5 inline mr-1" />
                    Nombre <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) =>
                      setForm({ ...form, nombre: e.target.value })
                    }
                    placeholder="Nombre completo del cliente"
                    className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    <Phone className="w-3.5 h-3.5 inline mr-1" />
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={form.telefono}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        telefono: formatTelefono(e.target.value),
                      })
                    }
                    placeholder="(310) 420 1761"
                    className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    <Phone className="w-3.5 h-3.5 inline mr-1" />
                    Teléfono 2 (opcional)
                  </label>
                  <input
                    type="text"
                    value={form.telefono2}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        telefono2: formatTelefono(e.target.value),
                      })
                    }
                    placeholder="(310) 420 1761"
                    className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    <Mail className="w-3.5 h-3.5 inline mr-1" />
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={form.correo}
                    onChange={(e) =>
                      setForm({ ...form, correo: e.target.value })
                    }
                    placeholder="cliente@correo.com"
                    className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Notas
                  </label>
                  <input
                    type="text"
                    value={form.notas}
                    onChange={(e) =>
                      setForm({ ...form, notas: e.target.value })
                    }
                    placeholder="Observaciones opcionales..."
                    className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
                  />
                </div>
              </div>

              {/* Vehicles in form — only shown when creating a new client */}
              {!editingId && (
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    <Car className="w-3.5 h-3.5 inline mr-1" />
                    Vehículos
                  </label>
                  <div className="space-y-2">
                    {vehiculos.map((v, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input
                          type="text"
                          placeholder="Placa / Identificador (ej: GHJ123, MICRO 143 VIACOLTUR)"
                          value={v.placa}
                          onChange={(e) =>
                            updateVehRow(i, "placa", e.target.value)
                          }
                          className="flex-1 bg-background border border-border px-3 py-2 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none font-mono"
                        />
                        <input
                          type="text"
                          placeholder="Descripción (opcional)"
                          value={v.descripcion}
                          onChange={(e) =>
                            updateVehRow(i, "descripcion", e.target.value)
                          }
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
                  Para gestionar vehículos, usa los controles en la tarjeta del
                  cliente.
                </p>
              )}

              <div className="flex gap-3 justify-end border-t border-border pt-4">
                <button
                  onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 bg-muted text-foreground rounded-xl font-medium text-sm hover:bg-muted/80"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleGuardar}
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 shadow-md"
                >
                  {isSaving
                    ? "Guardando..."
                    : editingId
                      ? "Actualizar Cliente"
                      : "Crear Cliente"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Client list */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Cargando clientes...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-2xl border border-border">
            <User className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              {busqueda
                ? "Sin resultados para la búsqueda."
                : soloSinTelefono
                  ? "No hay clientes sin teléfono registrado."
                  : "No hay clientes registrados aún."}
            </p>
            {!busqueda && !soloSinTelefono && (
              <button
                onClick={openNew}
                className="mt-4 text-sm text-primary hover:underline"
              >
                Crear el primer cliente
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((c) => (
              <div
                key={c.id}
                className="bg-card border border-border rounded-2xl p-5 shadow-sm flex flex-col gap-3"
              >
                {/* Card header */}
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-foreground truncate text-base">
                      {c.nombre}
                    </h3>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {c.telefono && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="w-3 h-3" />{" "}
                          {formatTelefono(c.telefono)}
                        </p>
                      )}
                      {(c as any).telefono2 && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="w-3 h-3" />{" "}
                          {formatTelefono((c as any).telefono2)}
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
                      <span
                        className="text-[10px] text-amber-400 font-medium whitespace-nowrap"
                        title="Guardado local, esperando sincronizar"
                      >
                        ⏳ Pendiente
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 text-muted-foreground hover:text-primary rounded-lg transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleEliminar(c.id, c.nombre)}
                          className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {c.notas && (
                  <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 italic">
                    {c.notas}
                  </p>
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
                    {expanded.has(c.id) ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {expanded.has(c.id) && (
                    <div className="mt-2 space-y-1.5 animate-in fade-in">
                      {c.vehiculos.map((v) => (
                        <div
                          key={v.id}
                          className="group flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2"
                        >
                          {editingVehId === v.id &&
                          vehiculoForm?.clienteId === c.id ? (
                            <>
                              <input
                                type="text"
                                value={vehiculoForm.veh.placa}
                                onChange={(e) =>
                                  setVehiculoForm({
                                    clienteId: c.id,
                                    veh: {
                                      ...vehiculoForm.veh,
                                      placa: e.target.value,
                                    },
                                  })
                                }
                                className="flex-1 bg-background border border-border px-2 py-1 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none font-mono"
                                placeholder="Placa"
                                autoFocus
                              />
                              <input
                                type="text"
                                value={vehiculoForm.veh.descripcion}
                                onChange={(e) =>
                                  setVehiculoForm({
                                    clienteId: c.id,
                                    veh: {
                                      ...vehiculoForm.veh,
                                      descripcion: e.target.value,
                                    },
                                  })
                                }
                                className="flex-1 bg-background border border-border px-2 py-1 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none"
                                placeholder="Descripción"
                              />
                              <button
                                onClick={() => handleSaveVehiculo(c.id)}
                                className="p-1 text-primary hover:text-primary/80"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setVehiculoForm(null);
                                  setEditingVehId(null);
                                }}
                                className="p-1 text-muted-foreground hover:text-foreground"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="font-mono text-xs font-bold text-foreground flex-shrink-0">
                                {v.placa}
                              </span>
                              {v.descripcion && (
                                <span className="text-xs text-muted-foreground truncate flex-1">
                                  {v.descripcion}
                                </span>
                              )}
                              <div className="flex gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => {
                                    setEditingVehId(v.id);
                                    setVehiculoForm({
                                      clienteId: c.id,
                                      veh: {
                                        id: v.id,
                                        placa: v.placa,
                                        descripcion: v.descripcion ?? "",
                                      },
                                    });
                                  }}
                                  className="p-1 text-muted-foreground hover:text-primary rounded"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() =>
                                    handleEliminarVehiculo(c.id, v.id)
                                  }
                                  className="p-1 text-muted-foreground hover:text-destructive rounded"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}

                      {/* Add vehicle inline */}
                      {vehiculoForm?.clienteId === c.id &&
                      editingVehId === null ? (
                        <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                          <input
                            type="text"
                            value={vehiculoForm.veh.placa}
                            onChange={(e) =>
                              setVehiculoForm({
                                clienteId: c.id,
                                veh: {
                                  ...vehiculoForm.veh,
                                  placa: e.target.value,
                                },
                              })
                            }
                            className="flex-1 bg-background border border-border px-2 py-1 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none font-mono"
                            placeholder="Placa / Identificador"
                            autoFocus
                          />
                          <input
                            type="text"
                            value={vehiculoForm.veh.descripcion}
                            onChange={(e) =>
                              setVehiculoForm({
                                clienteId: c.id,
                                veh: {
                                  ...vehiculoForm.veh,
                                  descripcion: e.target.value,
                                },
                              })
                            }
                            className="flex-1 bg-background border border-border px-2 py-1 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none"
                            placeholder="Descripción"
                          />
                          <button
                            onClick={() => handleSaveVehiculo(c.id)}
                            className="p-1 text-primary hover:text-primary/80"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setVehiculoForm(null)}
                            className="p-1 text-muted-foreground hover:text-foreground"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setVehiculoForm({
                              clienteId: c.id,
                              veh: { ...emptyVeh },
                            });
                            setEditingVehId(null);
                          }}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors w-full px-3 py-1"
                        >
                          <Plus className="w-3 h-3" /> Agregar vehículo
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">
                      Saldo pendiente
                    </p>
                    <p className="font-semibold text-sm text-amber-500">
                      {isLoadingCreditos
                        ? "Cargando..."
                        : errorAlCargarCreditos
                          ? "No disponible"
                          : formatCurrency(
                              saldoPendientePorCliente.get(c.id) ?? 0,
                            )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => abrirEstadoCuenta(c)}
                    disabled={isLoadingCreditos || errorAlCargarCreditos}
                    className="inline-flex items-center gap-2 rounded-xl border border-primary/30 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                  >
                    <CreditCard className="h-4 w-4" />
                    Estado de cuenta
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {clienteCuenta && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setClienteCuenta(null);
              }
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="estado-cuenta-titulo"
              className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
            >
              <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <h2
                    id="estado-cuenta-titulo"
                    className="truncate text-lg font-bold text-foreground"
                  >
                    {clienteCuenta.nombre}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatTelefono(clienteCuenta.telefono) || "Sin teléfono"}
                    {clienteCuenta.correo ? ` · ${clienteCuenta.correo}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setClienteCuenta(null)}
                  aria-label="Cerrar estado de cuenta"
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="space-y-5 p-5 sm:p-6">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border bg-muted/40 p-4">
                    <p className="text-xs text-muted-foreground">Saldo pendiente</p>
                    <p className="mt-1 text-lg font-bold text-amber-500">
                      {formatCurrency(
                        creditosCuenta.reduce(
                          (total, credito) =>
                            total + Math.max(0, credito.valorRestante),
                          0,
                        ),
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/40 p-4">
                    <p className="text-xs text-muted-foreground">Total acreditado</p>
                    <p className="mt-1 text-lg font-bold text-foreground">
                      {formatCurrency(
                        creditosCuenta.reduce(
                          (total, credito) => total + credito.valorCredito,
                          0,
                        ),
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/40 p-4">
                    <p className="text-xs text-muted-foreground">Total abonado</p>
                    <p className="mt-1 text-lg font-bold text-emerald-500">
                      {formatCurrency(
                        creditosCuenta.reduce(
                          (total, credito) => total + credito.valorAbonado,
                          0,
                        ),
                      )}
                    </p>
                  </div>
                </div>

                {creditosPendientesCuenta.length > 0 ? (
                  <form
                    className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      registrarAbonoCuenta();
                    }}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                      <ArrowDownLeft className="h-4 w-4" />
                      Registrar abono
                    </div>
                    <label className="block space-y-1 text-xs text-muted-foreground">
                      <span>Crédito pendiente</span>
                      <select
                        value={creditoAbonoSeleccionado?.id ?? ""}
                        onChange={(event) =>
                          setPagoCreditoId(Number(event.target.value))
                        }
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                      >
                        {creditosPendientesCuenta.map((credito) => (
                          <option key={credito.id} value={credito.id}>
                            {credito.concepto || `Crédito #${credito.id}`} · saldo{" "}
                            {formatCurrency(credito.valorRestante)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <label className="space-y-1 text-xs text-muted-foreground">
                        <span>Valor del abono (COP)</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          max={creditoAbonoSeleccionado?.valorRestante}
                          value={pagoValor}
                          onChange={(event) => setPagoValor(event.target.value)}
                          placeholder="Ej. 120000"
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-muted-foreground">
                        <span>Nota o referencia (opcional)</span>
                        <input
                          type="text"
                          value={pagoNota}
                          onChange={(event) => setPagoNota(event.target.value)}
                          placeholder="Referencia del pago"
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={abonarMutation.isPending || !creditoAbonoSeleccionado}
                        className="self-end rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {abonarMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Abonar"
                        )}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    {creditosCuenta.length > 0
                      ? "Este cliente no tiene créditos pendientes."
                      : "Este cliente aún no tiene créditos registrados."}
                  </div>
                )}

                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-foreground">
                      Créditos pendientes
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {creditosPendientesCuenta.length} crédito
                      {creditosPendientesCuenta.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {creditosPendientesCuenta.length > 0 ? (
                    <div className="space-y-2">
                      {creditosPendientesCuenta.map((credito) => (
                        <div
                          key={credito.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {credito.concepto || `Crédito #${credito.id}`}
                            </p>
                            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <CalendarDays className="h-3 w-3" />
                              {fechaCuenta(credito.fechaFactura)}
                              {credito.placaVehiculo
                                ? ` · ${credito.placaVehiculo}`
                                : ""}
                            </p>
                          </div>
                          <p className="font-semibold text-amber-500">
                            {formatCurrency(credito.valorRestante)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
                      No hay créditos pendientes.
                    </p>
                  )}
                </section>

                <section className="space-y-3">
                  <h3 className="font-semibold text-foreground">
                    Historial de la cuenta
                  </h3>
                  {movimientosCuenta.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-border">
                      {movimientosCuenta.map((movimiento) => (
                        <div
                          key={movimiento.id}
                          className="flex items-center gap-3 border-b border-border p-3 last:border-b-0"
                        >
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                              movimiento.tipo === "credito"
                                ? "bg-amber-500/15 text-amber-600"
                                : "bg-emerald-500/15 text-emerald-600"
                            }`}
                          >
                            {movimiento.tipo === "credito" ? (
                              <ArrowUpRight className="h-4 w-4" />
                            ) : (
                              <ArrowDownLeft className="h-4 w-4" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {movimiento.tipo === "credito"
                                ? `Crédito · ${movimiento.descripcion}`
                                : `Abono · ${movimiento.descripcion}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {fechaCuenta(movimiento.fecha)}
                            </p>
                          </div>
                          <p
                            className={`whitespace-nowrap text-sm font-semibold ${
                              movimiento.tipo === "credito"
                                ? "text-amber-600"
                                : "text-emerald-600"
                            }`}
                          >
                            {movimiento.tipo === "credito" ? "+" : "−"}
                            {formatCurrency(movimiento.valor)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
                      No hay movimientos para mostrar.
                    </p>
                  )}
                </section>
              </div>
            </section>
          </div>
        )}
      </div>
    </Layout>
  );
}
