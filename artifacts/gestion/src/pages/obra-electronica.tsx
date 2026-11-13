import { useEffect, useMemo, useState } from "react";
import { Hand, Pencil, Printer, Trash2, X } from "lucide-react";
import { Layout } from "@/components/Layout";
import { fechaHoyColombia, formatCurrency } from "@/lib/utils";
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
  guardarSugerenciaReciente,
} from "@/lib/sugerencias-obra";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");

type Registro = {
  id: number;
  trabajadorId: number | null;
  empleadoNombre: string;
  fecha: string;
  numeroFactura: string;
  vehiculo: string;
  valor: number;
};

function mesActual() {
  return fechaHoyColombia().slice(0, 7);
}

function valorMostrado(raw: string): number {
  const numero = Number(raw.trim().replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(numero) || numero < 0) return 0;
  return numero < 1000 ? numero * 1000 : numero;
}

export default function ObraElectronica() {
  const [mes, setMes] = useState(mesActual);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<Registro | null>(null);
  const [borrador, setBorrador] = useState({ fecha: "", numeroFactura: "", vehiculo: "", valor: "" });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const [empleadosExcluidos, setEmpleadosExcluidos] = useState<string[]>([]);
  const [imprimirTotales, setImprimirTotales] = useState(true);
  const [facturasRecientes, setFacturasRecientes] = useState(() => cargarSugerenciasRecientes(CLAVE_FACTURAS_OBRA));
  const [vehiculosRecientes, setVehiculosRecientes] = useState(() => cargarSugerenciasRecientes(CLAVE_VEHICULOS_OBRA));
  const [valoresRecientes, setValoresRecientes] = useState(() => cargarSugerenciasRecientes(CLAVE_VALORES_OBRA));

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await fetch(`${API}/obra-electronica?mes=${mes}`);
      setRegistros(res.ok ? await res.json() : []);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, [mes]);
  useEffect(() => {
    const actualizar = () => cargar();
    window.addEventListener("obra-electronica-actualizada", actualizar);
    return () => window.removeEventListener("obra-electronica-actualizada", actualizar);
  }, [mes]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, Registro[]>();
    registros.forEach((registro) => {
      if (!mapa.has(registro.empleadoNombre)) mapa.set(registro.empleadoNombre, []);
      mapa.get(registro.empleadoNombre)!.push(registro);
    });
    return [...mapa.entries()];
  }, [registros]);
  const todosEmpleadosSeleccionados = grupos.length > 0 &&
    grupos.every(([nombre]) => !empleadosExcluidos.includes(nombre));
  const alternarTodosEmpleados = () => {
    setEmpleadosExcluidos(todosEmpleadosSeleccionados ? grupos.map(([nombre]) => nombre) : []);
  };

  const totalesPorObra = useMemo(() => {
    const mapa = new Map<string, { numeroFactura: string; vehiculo: string; valor: number; trabajadores: Set<string> }>();
    registros.forEach((registro) => {
      const numeroFactura = registro.numeroFactura.trim();
      const vehiculo = registro.vehiculo.trim();
      const clave = JSON.stringify([numeroFactura.toLocaleUpperCase(), vehiculo.toLocaleUpperCase()]);
      const grupo = mapa.get(clave) ?? { numeroFactura, vehiculo, valor: 0, trabajadores: new Set<string>() };
      grupo.valor += Number(registro.valor || 0);
      grupo.trabajadores.add(registro.empleadoNombre);
      mapa.set(clave, grupo);
    });
    return [...mapa.values()].sort((a, b) =>
      a.numeroFactura.localeCompare(b.numeroFactura) || a.vehiculo.localeCompare(b.vehiculo),
    );
  }, [registros]);

  const totalMes = registros.reduce((suma, registro) => suma + Number(registro.valor || 0), 0);
  const etiquetaMes = new Date(`${mes}-15T12:00:00`).toLocaleDateString("es-CO", { month: "long", year: "numeric" });

  const guardarSugerenciasEditadas = () => {
    setFacturasRecientes(
      guardarSugerenciaReciente(CLAVE_FACTURAS_OBRA, borrador.numeroFactura, facturasRecientes),
    );
    setVehiculosRecientes(
      guardarSugerenciaReciente(CLAVE_VEHICULOS_OBRA, borrador.vehiculo, vehiculosRecientes),
    );
    setValoresRecientes(
      guardarSugerenciaReciente(CLAVE_VALORES_OBRA, borrador.valor, valoresRecientes),
    );
  };

  const iniciarEdicion = (registro: Registro) => {
    setEditando(registro);
    setBorrador({ fecha: registro.fecha, numeroFactura: registro.numeroFactura, vehiculo: registro.vehiculo, valor: String(registro.valor) });
  };

  const guardarEdicion = async () => {
    if (!editando || guardandoEdicion) return;
    setGuardandoEdicion(true);
    try {
      await leerRespuestaApi(fetch(`${API}/obra-electronica/${editando.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...borrador, valor: valorMostrado(borrador.valor) }),
      }));
      guardarSugerenciasEditadas();
      setEditando(null);
      await cargar();
    } catch (error) {
      if (esOperacionEncoladaOffline(error)) {
        guardarSugerenciasEditadas();
        setRegistros((prev) =>
          prev.map((registro) =>
            registro.id === editando.id
              ? {
                  ...registro,
                  ...borrador,
                  valor: valorMostrado(borrador.valor),
                }
              : registro,
          ),
        );
        setEditando(null);
        return;
      }
      if (esOperacionOfflineNoGuardada(error)) return;
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const eliminar = async (id: number) => {
    if (eliminandoId !== null || !confirm("¿Eliminar esta obra electrónica?")) return;
    setEliminandoId(id);
    try {
      await leerRespuestaApi(fetch(`${API}/obra-electronica/${id}`, { method: "DELETE" }));
      await cargar();
    } catch (error) {
      if (esOperacionEncoladaOffline(error)) {
        setRegistros((prev) => prev.filter((registro) => registro.id !== id));
        return;
      }
      if (esOperacionOfflineNoGuardada(error)) return;
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setEliminandoId(null);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="no-print flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground flex items-center gap-2"><Hand className="w-7 h-7 text-amber-400" /> Obra Electrónica</h1>
            <p className="text-muted-foreground mt-1 text-sm">Registros independientes de obra electrónica por empleado.</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="month" value={mes} onChange={(e) => {
              setMes(e.target.value);
              setEmpleadosExcluidos([]);
            }} className="bg-card border border-border px-3 py-2 rounded-xl text-sm" />
            <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium"><Printer className="w-4 h-4" /> Imprimir</button>
          </div>
        </div>

        <div className="no-print flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="font-medium text-foreground">Imprimir:</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={imprimirTotales} onChange={(e) => setImprimirTotales(e.target.checked)} className="accent-primary" />
            Totales por factura / vehículo
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={todosEmpleadosSeleccionados} onChange={alternarTodosEmpleados} className="accent-primary" />
            Todos los empleados
          </label>
          {grupos.map(([nombre]) => (
            <label key={nombre} className="flex items-center gap-2 cursor-pointer text-muted-foreground">
              <input
                type="checkbox"
                checked={!empleadosExcluidos.includes(nombre)}
                onChange={(e) => setEmpleadosExcluidos((prev) => e.target.checked
                  ? prev.filter((excluido) => excluido !== nombre)
                  : [...prev, nombre])}
                className="accent-primary"
              />
              {nombre}
            </label>
          ))}
        </div>

        <div className="print-zone obra-electronica-print-zone">
          <div className="print-date-header">OBRA ELECTRÓNICA — {etiquetaMes.toUpperCase()}</div>
          {cargando ? <p className="py-10 text-center text-muted-foreground no-print">Cargando...</p> : grupos.length === 0 ? <p className="py-10 text-center text-muted-foreground">No hay obras electrónicas en este mes.</p> : (
            <div className="obra-electronica-grid">
              {grupos.map(([nombre, items]) => {
                const totalEmpleado = items.reduce((suma, registro) => suma + Number(registro.valor || 0), 0);
                return (
                  <section key={nombre} className={`obra-electronica-grupo ${empleadosExcluidos.includes(nombre) ? "print-omit" : ""}`}>
                    <h2 className="bg-amber-400 text-black font-bold text-center py-2">{nombre.toUpperCase()}</h2>
                    <table className="w-full obra-electronica-table">
                      <thead><tr><th>FECHA</th><th>NUMERO FACTURA</th><th className="text-center">PLACA / VEHÍCULO</th><th className="text-right">VALOR</th><th className="no-print"></th></tr></thead>
                      <tbody>
                        {items.map((registro) => <tr key={registro.id}>
                          <td>{new Date(`${registro.fecha}T12:00:00`).toLocaleDateString("es-CO")}</td>
                          <td>{registro.numeroFactura || "-"}</td>
                          <td className="text-center">{registro.vehiculo || "-"}</td>
                          <td className="text-right">{formatCurrency(registro.valor)}</td>
                          <td className="no-print text-center whitespace-nowrap">
                            <button title="Editar" onClick={() => iniciarEdicion(registro)} className="mr-2 text-primary"><Pencil className="inline w-4 h-4" /></button>
                            <button title="Eliminar" onClick={() => eliminar(registro.id)} className="text-destructive"><Trash2 className="inline w-4 h-4" /></button>
                          </td>
                        </tr>)}
                      </tbody>
                      <tfoot><tr><td colSpan={3}>TOTAL {nombre.toUpperCase()}</td><td className="text-right">{formatCurrency(totalEmpleado)}</td><td className="no-print"></td></tr></tfoot>
                    </table>
                  </section>
                );
              })}
              <section className={`obra-electronica-resumen ${imprimirTotales ? "" : "print-omit"}`}>
                <h2 className="bg-amber-400 text-black font-bold text-center py-2">TOTALES POR FACTURA / VEHÍCULO</h2>
                <table className="w-full obra-electronica-table">
                  <thead><tr><th>NUMERO FACTURA</th><th>PLACA / VEHÍCULO</th><th>TRABAJADORES</th><th className="text-right">TOTAL MANO DE OBRA</th></tr></thead>
                  <tbody>
                    {totalesPorObra.map((grupo) => <tr key={`${grupo.numeroFactura}-${grupo.vehiculo}`}>
                      <td>{grupo.numeroFactura || "-"}</td>
                      <td className="text-center">{grupo.vehiculo || "-"}</td>
                      <td className="text-center">{grupo.trabajadores.size}</td>
                      <td className="text-right">{formatCurrency(grupo.valor)}</td>
                    </tr>)}
                  </tbody>
                </table>
                <table className="w-full obra-electronica-total"><tfoot><tr><td>TOTAL GENERAL DEL MES</td><td className="text-right">{formatCurrency(totalMes)}</td></tr></tfoot></table>
              </section>
            </div>
          )}
        </div>

        {editando && <div className="no-print fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center"><h2 className="font-bold">Editar obra electrónica</h2><button onClick={() => setEditando(null)}><X className="w-5 h-5" /></button></div>
            <input type="date" value={borrador.fecha} onChange={(e) => setBorrador((p) => ({ ...p, fecha: e.target.value }))} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <input value={borrador.numeroFactura} list="obra-electronica-editar-facturas" onChange={(e) => setBorrador((p) => ({ ...p, numeroFactura: e.target.value }))} placeholder="Número de factura (opcional)" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <datalist id="obra-electronica-editar-facturas">
              {facturasRecientes.map((factura) => <option key={factura} value={factura} />)}
            </datalist>
            <input value={borrador.vehiculo} list="obra-electronica-editar-vehiculos" onChange={(e) => setBorrador((p) => ({ ...p, vehiculo: e.target.value }))} placeholder="Placa o vehículo" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <datalist id="obra-electronica-editar-vehiculos">
              {vehiculosRecientes.map((vehiculo) => <option key={vehiculo} value={vehiculo} />)}
            </datalist>
            <input value={borrador.valor} list="obra-electronica-editar-valores" onChange={(e) => setBorrador((p) => ({ ...p, valor: e.target.value }))} placeholder="Valor: 60 o 12,5" inputMode="decimal" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <datalist id="obra-electronica-editar-valores">
              {valoresRecientes.map((valor) => <option key={valor} value={valor} />)}
            </datalist>
            <button onClick={guardarEdicion} disabled={guardandoEdicion} className="w-full bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50">{guardandoEdicion ? "Guardando..." : "Guardar cambios"}</button>
          </div>
        </div>}
      </div>
    </Layout>
  );
}
