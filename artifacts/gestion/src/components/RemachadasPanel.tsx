import { useState, useEffect, useMemo } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const API = "/api";

interface RemachadaRow {
  id: number;
  numeroBanda: string;
  valorJuego: number;
}

type OrdenColumna = "banda" | "valor";
type DireccionOrden = "asc" | "desc";

export function RemachadasPanel() {
  const [remachadas, setRemachadas] = useState<RemachadaRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editValor, setEditValor] = useState("");
  const [nuevaBanda, setNuevaBanda] = useState("");
  const [nuevoValor, setNuevoValor] = useState("");
  const [filtroPrecio, setFiltroPrecio] = useState("");
  const [busquedaBanda, setBusquedaBanda] = useState("");
  const [ordenColumna, setOrdenColumna] = useState<OrdenColumna>("banda");
  const [direccionOrden, setDireccionOrden] = useState<DireccionOrden>("asc");

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await fetch(`${API}/remachadas`);
      setRemachadas(await res.json());
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const agregar = async () => {
    if (!nuevaBanda.trim() || !nuevoValor) return;
    const res = await fetch(`${API}/remachadas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        numeroBanda: nuevaBanda.trim(),
        valorJuego: parseFloat(nuevoValor),
      }),
    });
    const row = await res.json();
    setRemachadas((prev) => [...prev, row]);
    setNuevaBanda("");
    setNuevoValor("");
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

  const preciosUnicos = useMemo(
    () =>
      [...new Set(remachadas.map((r) => r.valorJuego))].sort((a, b) => a - b),
    [remachadas],
  );

  const remachadasFiltradas = useMemo(() => {
    const consulta = busquedaBanda.trim().toLocaleLowerCase();
    const filtradas = remachadas.filter(
      (r) =>
        (!filtroPrecio || r.valorJuego === parseFloat(filtroPrecio)) &&
        (!consulta || r.numeroBanda.toLocaleLowerCase().includes(consulta)),
    );

    return filtradas.sort((a, b) => {
      const comparacion =
        ordenColumna === "banda"
          ? a.numeroBanda.localeCompare(b.numeroBanda, "es", {
              numeric: true,
              sensitivity: "base",
            })
          : a.valorJuego - b.valorJuego;
      return direccionOrden === "asc" ? comparacion : -comparacion;
    });
  }, [remachadas, filtroPrecio, busquedaBanda, ordenColumna, direccionOrden]);

  const filasPorTabla = Math.ceil(remachadasFiltradas.length / 4);
  const tablas = Array.from({ length: 4 }, (_, index) =>
    remachadasFiltradas.slice(
      index * filasPorTabla,
      (index + 1) * filasPorTabla,
    ),
  );

  const cambiarOrden = (columna: OrdenColumna) => {
    if (ordenColumna === columna) {
      setDireccionOrden((actual) => (actual === "asc" ? "desc" : "asc"));
      return;
    }
    setOrdenColumna(columna);
    setDireccionOrden("asc");
  };

  const iconoOrden = (columna: OrdenColumna) => {
    if (ordenColumna !== columna) {
      return <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />;
    }
    return direccionOrden === "asc" ? (
      <ChevronUp className="h-3.5 w-3.5 text-primary" />
    ) : (
      <ChevronDown className="h-3.5 w-3.5 text-primary" />
    );
  };

  const renderTabla = (filas: RemachadaRow[], indice: number) => (
    <div
      key={indice}
      className="min-w-0 overflow-hidden rounded-xl border border-border/80 bg-background/30"
    >
      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className="bg-muted/80 text-muted-foreground">
            <th className="w-[38%] px-2 py-2 text-left">
              <button
                type="button"
                onClick={() => cambiarOrden("banda")}
                className="flex items-center gap-1 whitespace-nowrap font-semibold hover:text-foreground"
              >
                Número banda {iconoOrden("banda")}
              </button>
            </th>
            <th className="px-2 py-2 text-right">
              <button
                type="button"
                onClick={() => cambiarOrden("valor")}
                className="ml-auto flex items-center gap-1 whitespace-nowrap font-semibold hover:text-foreground"
              >
                Valor remachada {iconoOrden("valor")}
              </button>
            </th>
            <th className="w-[3.5rem] px-1 py-2" aria-label="Acciones" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {filas.map((r) => (
            <tr key={r.id} className="transition-colors hover:bg-muted/40">
              <td className="truncate px-2 py-2 font-medium" title={r.numeroBanda}>
                {r.numeroBanda}
              </td>
              <td className="px-2 py-2 text-right whitespace-nowrap">
                {editandoId === r.id ? (
                  <input
                    type="number"
                    value={editValor}
                    onChange={(e) => setEditValor(e.target.value)}
                    className="w-full rounded-lg border border-primary/50 bg-background px-2 py-1 text-right text-sm"
                  />
                ) : (
                  formatCurrency(r.valorJuego)
                )}
              </td>
              <td className="px-1 py-2">
                <div className="flex justify-end gap-0.5">
                  {editandoId === r.id ? (
                    <button
                      type="button"
                      aria-label="Guardar cambio"
                      onClick={() => guardarEdicion(r.id)}
                      className="rounded-md p-1 text-primary hover:bg-primary/10"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Editar banda ${r.numeroBanda}`}
                      onClick={() => {
                        setEditandoId(r.id);
                        setEditValor(String(r.valorJuego));
                      }}
                      className="rounded-md p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Eliminar banda ${r.numeroBanda}`}
                    onClick={() => eliminar(r.id)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="relative -mt-2 rounded-2xl border border-border bg-card p-4 shadow-xl shadow-black/10 sm:p-5">
      <h2 className="mb-1 text-lg font-display font-bold text-foreground">
        Remachadas
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Administra el valor por juego (1) de cada número de banda. El medio
        juego (0.5) y una banda (0.25) se calculan solos en la Calculadora de
        Cierre.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          placeholder="Número de banda"
          value={nuevaBanda}
          onChange={(e) => setNuevaBanda(e.target.value)}
          className="w-48 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
        />
        <input
          type="number"
          placeholder="Valor remachada (juego)"
          value={nuevoValor}
          onChange={(e) => setNuevoValor(e.target.value)}
          className="w-52 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="button"
          onClick={agregar}
          className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Agregar
        </button>
      </div>

      <div className="mb-3 flex flex-col gap-3 rounded-xl border border-border/70 bg-background/40 p-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <label
            htmlFor="remachadas-filtro-precio"
            className="whitespace-nowrap text-xs font-medium text-muted-foreground"
          >
            Filtrar por precio
          </label>
          <select
            id="remachadas-filtro-precio"
            value={filtroPrecio}
            onChange={(e) => setFiltroPrecio(e.target.value)}
            className="min-w-0 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Todos ({remachadas.length})</option>
            {preciosUnicos.map((precio) => {
              const cantidad = remachadas.filter(
                (r) => r.valorJuego === precio,
              ).length;
              return (
                <option key={precio} value={precio}>
                  {formatCurrency(precio)} ({cantidad})
                </option>
              );
            })}
          </select>
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            aria-label="Buscar número de banda"
            placeholder="Buscar número de banda..."
            value={busquedaBanda}
            onChange={(e) => setBusquedaBanda(e.target.value)}
            className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {remachadasFiltradas.length} bandas
        </span>
      </div>

      {cargando ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Cargando...
        </p>
      ) : remachadasFiltradas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {filtroPrecio || busquedaBanda
            ? "No se encontraron bandas con esos filtros."
            : "No hay bandas registradas todavía."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {tablas.map((filas, indice) =>
            filas.length > 0 ? renderTabla(filas, indice) : null,
          )}
        </div>
      )}
    </div>
  );
}
