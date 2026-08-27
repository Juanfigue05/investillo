import { useState, useEffect } from "react";
import { Plus, Trash2, Pencil, Check } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");

interface RemachadaRow {
  id: number;
  numeroBanda: string;
  valorJuego: number;
}

export function RemachadasPanel() {
  const [remachadas, setRemachadas] = useState<RemachadaRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editValor, setEditValor] = useState("");
  const [nuevaBanda, setNuevaBanda] = useState("");
  const [nuevoValor, setNuevoValor] = useState("");

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await fetch(`${API}/remachadas`);
      setRemachadas(await res.json());
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const agregar = async () => {
    if (!nuevaBanda.trim() || !nuevoValor) return;
    const res = await fetch(`${API}/remachadas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numeroBanda: nuevaBanda.trim(), valorJuego: parseFloat(nuevoValor) }),
    });
    const row = await res.json();
    setRemachadas((prev) => [...prev, row]);
    setNuevaBanda(""); setNuevoValor("");
  };

  const guardarEdicion = async (id: number) => {
    const res = await fetch(`${API}/remachadas/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valorJuego: parseFloat(editValor) }),
    });
    const row = await res.json();
    setRemachadas((prev) => prev.map((r) => (r.id === id ? row : r)));
    setEditandoId(null);
  };

  const eliminar = async (id: number) => {
    if (!confirm("¿Eliminar esta banda?")) return;
    await fetch(`${API}/remachadas/${id}`, { method: "DELETE" });
    setRemachadas((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-xl">
      <h2 className="text-lg font-display font-bold text-foreground mb-1">Remachadas</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Administra el valor por juego (1) de cada número de banda. El medio juego (0.5) y una banda (0.25) se calculan solos en la Calculadora de Cierre.
      </p>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted text-muted-foreground">
              <th className="px-3 py-2 text-left">Número banda</th>
              <th className="px-3 py-2 text-right">Valor remachada (juego)</th>
              <th className="px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {cargando ? (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">Cargando...</td></tr>
            ) : remachadas.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">No hay bandas registradas todavía.</td></tr>
            ) : (
              remachadas.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium">{r.numeroBanda}</td>
                  <td className="px-3 py-2 text-right">
                    {editandoId === r.id ? (
                      <input type="number" value={editValor} onChange={(e) => setEditValor(e.target.value)}
                        className="w-28 bg-background border border-primary/50 px-2 py-1 rounded-lg text-sm text-right" />
                    ) : formatCurrency(r.valorJuego)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 justify-end">
                      {editandoId === r.id ? (
                        <button onClick={() => guardarEdicion(r.id)} className="p-1 text-primary"><Check className="w-4 h-4" /></button>
                      ) : (
                        <button onClick={() => { setEditandoId(r.id); setEditValor(String(r.valorJuego)); }} className="p-1 text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></button>
                      )}
                      <button onClick={() => eliminar(r.id)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 mt-4">
        <input placeholder="Número de banda" value={nuevaBanda} onChange={(e) => setNuevaBanda(e.target.value)}
          className="w-48 bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
        <input type="number" placeholder="Valor remachada (juego)" value={nuevoValor} onChange={(e) => setNuevoValor(e.target.value)}
          className="w-52 bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
        <button onClick={agregar} className="flex items-center gap-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Agregar
        </button>
      </div>
    </div>
  );
}