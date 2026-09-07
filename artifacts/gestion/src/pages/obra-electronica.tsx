import { useEffect, useMemo, useState } from "react";
import { Hand, Pencil, Printer, Trash2, X } from "lucide-react";
import { Layout } from "@/components/Layout";
import { fechaHoyColombia, formatCurrency } from "@/lib/utils";

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

  const totalMes = registros.reduce((suma, registro) => suma + Number(registro.valor || 0), 0);
  const etiquetaMes = new Date(`${mes}-15T12:00:00`).toLocaleDateString("es-CO", { month: "long", year: "numeric" });

  const iniciarEdicion = (registro: Registro) => {
    setEditando(registro);
    setBorrador({ fecha: registro.fecha, numeroFactura: registro.numeroFactura, vehiculo: registro.vehiculo, valor: String(registro.valor) });
  };

  const guardarEdicion = async () => {
    if (!editando) return;
    const res = await fetch(`${API}/obra-electronica/${editando.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...borrador, valor: valorMostrado(borrador.valor) }),
    });
    if (!res.ok) { alert((await res.json().catch(() => null))?.error || "No se pudo guardar"); return; }
    setEditando(null);
    await cargar();
  };

  const eliminar = async (id: number) => {
    if (!confirm("¿Eliminar esta obra electrónica?")) return;
    const res = await fetch(`${API}/obra-electronica/${id}`, { method: "DELETE" });
    if (!res.ok) { alert("No se pudo eliminar"); return; }
    await cargar();
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
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="bg-card border border-border px-3 py-2 rounded-xl text-sm" />
            <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium"><Printer className="w-4 h-4" /> Imprimir</button>
          </div>
        </div>

        <div className="print-zone obra-electronica-print-zone">
          <div className="print-date-header">OBRA ELECTRÓNICA — {etiquetaMes.toUpperCase()}</div>
          {cargando ? <p className="py-10 text-center text-muted-foreground no-print">Cargando...</p> : grupos.length === 0 ? <p className="py-10 text-center text-muted-foreground">No hay obras electrónicas en este mes.</p> : (
            <div className="obra-electronica-grid">
              {grupos.map(([nombre, items]) => {
                const totalEmpleado = items.reduce((suma, registro) => suma + Number(registro.valor || 0), 0);
                return (
                  <section key={nombre} className="obra-electronica-grupo">
                    <h2 className="bg-amber-400 text-black font-bold text-center py-2">{nombre.toUpperCase()}</h2>
                    <table className="w-full obra-electronica-table">
                      <thead><tr><th>FECHA</th><th>NUMERO FACTURA</th><th>PLACA / VEHÍCULO</th><th className="text-right">VALOR</th><th className="no-print">ACCIONES</th></tr></thead>
                      <tbody>
                        {items.map((registro) => <tr key={registro.id}>
                          <td>{new Date(`${registro.fecha}T12:00:00`).toLocaleDateString("es-CO")}</td>
                          <td>{registro.numeroFactura || "-"}</td>
                          <td>{registro.vehiculo || "-"}</td>
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
              <table className="w-full obra-electronica-total"><tfoot><tr><td>TOTAL GENERAL DEL MES</td><td className="text-right">{formatCurrency(totalMes)}</td></tr></tfoot></table>
            </div>
          )}
        </div>

        {editando && <div className="no-print fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={() => setEditando(null)}>
          <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center"><h2 className="font-bold">Editar obra electrónica</h2><button onClick={() => setEditando(null)}><X className="w-5 h-5" /></button></div>
            <input type="date" value={borrador.fecha} onChange={(e) => setBorrador((p) => ({ ...p, fecha: e.target.value }))} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <input value={borrador.numeroFactura} onChange={(e) => setBorrador((p) => ({ ...p, numeroFactura: e.target.value }))} placeholder="Número de factura" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <input value={borrador.vehiculo} onChange={(e) => setBorrador((p) => ({ ...p, vehiculo: e.target.value }))} placeholder="Placa o vehículo" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <input value={borrador.valor} onChange={(e) => setBorrador((p) => ({ ...p, valor: e.target.value }))} placeholder="Valor: 60 o 12,5" inputMode="decimal" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <button onClick={guardarEdicion} className="w-full bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-medium">Guardar cambios</button>
          </div>
        </div>}
      </div>
    </Layout>
  );
}
