import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Lock, Unlock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Trabajador {
  id: number;
  nombre: string;
}

export interface DistribucionItem {
  trabajadorId: number;
  valor: number;
  fijado: boolean;
}

interface Props {
  trabajadores: Trabajador[];
  total: number;
  seleccionados: number[];
  fijados: Record<number, number>;
  onChangeSeleccionados: (ids: number[]) => void;
  onChangeFijados: (fijados: Record<number, number>) => void;
}

export function calcularDistribucion(total: number, seleccionados: number[], fijados: Record<number, number>): DistribucionItem[] {
  const totalRedondeado = Math.round(total) || 0;
  const fijadosIds = seleccionados.filter((id) => fijados[id] !== undefined);
  const autoIds = seleccionados.filter((id) => fijados[id] === undefined);
  const sumaFijados = fijadosIds.reduce((s, id) => s + Math.round(fijados[id] || 0), 0);
  const restante = Math.max(0, totalRedondeado - sumaFijados);

  const n = autoIds.length;
  const base = n > 0 ? Math.floor(restante / n) : 0;
  const extra = n > 0 ? restante - base * n : 0;

  const resultado: DistribucionItem[] = [];
  fijadosIds.forEach((id) => resultado.push({ trabajadorId: id, valor: Math.round(fijados[id]), fijado: true }));
  autoIds.forEach((id, i) => resultado.push({ trabajadorId: id, valor: base + (i < extra ? 1 : 0), fijado: false }));
  return resultado;
}

export function ManoObraSelector({ trabajadores, total, seleccionados, fijados, onChangeSeleccionados, onChangeFijados }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        !(portalRef.current && portalRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const abrir = () => {
    const el = triggerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const width = 288; // w-72
      let left = rect.left;
      if (left + width > window.innerWidth - 16) left = window.innerWidth - width - 16;
      setPos({ top: rect.bottom + 4, left });
    }
    setIsOpen((o) => !o);
  };

  const distribucion = useMemo(() => calcularDistribucion(total, seleccionados, fijados), [total, seleccionados, fijados]);
  const totalRedondeado = Math.round(total) || 0;
  const sumaFijados = seleccionados
    .filter((id) => fijados[id] !== undefined)
    .reduce((s, id) => s + Math.round(fijados[id] || 0), 0);
  const excede = sumaFijados > totalRedondeado;

  const toggleTrabajador = (id: number) => {
    if (seleccionados.includes(id)) {
      onChangeSeleccionados(seleccionados.filter((t) => t !== id));
      const { [id]: _omit, ...rest } = fijados;
      onChangeFijados(rest);
    } else {
      onChangeSeleccionados([...seleccionados, id]);
    }
  };

  const fijarValor = (id: number, valorStr: string) => {
    const valor = parseFloat(valorStr);
    if (valorStr === "" || isNaN(valor)) {
      const { [id]: _omit, ...rest } = fijados;
      onChangeFijados(rest);
      return;
    }
    onChangeFijados({ ...fijados, [id]: valor });
  };

  const liberar = (id: number) => {
    const { [id]: _omit, ...rest } = fijados;
    onChangeFijados(rest);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={abrir}
        className="w-full text-left px-2 py-1.5 rounded-lg border border-yellow-500/50 bg-yellow-500/10 text-xs font-medium text-yellow-400 hover:bg-yellow-500/20 transition-all"
      >
        {seleccionados.length > 0 ? `${seleccionados.length} trabajador${seleccionados.length === 1 ? "" : "es"}` : "Seleccionar trabajadores"}
      </button>

      {isOpen && pos && createPortal(
        <div
          ref={portalRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-72 rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-xs font-semibold text-foreground">Mano de obra — {formatCurrency(totalRedondeado)}</p>
            <button type="button" onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto p-2 space-y-1">
            {trabajadores.length === 0 && (
              <p className="text-xs text-muted-foreground px-2 py-3 text-center">
                No hay trabajadores registrados todavía.
              </p>
            )}
            {trabajadores.map((t) => {
              const seleccionado = seleccionados.includes(t.id);
              const item = distribucion.find((d) => d.trabajadorId === t.id);
              const fijado = fijados[t.id] !== undefined;

              return (
                <div key={t.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${seleccionado ? "bg-yellow-500/10" : "hover:bg-muted"}`}>
                  <input type="checkbox" checked={seleccionado} onChange={() => toggleTrabajador(t.id)} className="accent-yellow-500" />
                  <span className="flex-1 text-sm text-foreground truncate">{t.nombre}</span>
                  {seleccionado && (
                    <>
                      <input
                        type="number"
                        step="1"
                        placeholder={String(item?.valor ?? 0)}
                        value={fijado ? String(Math.round(fijados[t.id])) : ""}
                        onChange={(e) => fijarValor(t.id, e.target.value)}
                        className="w-20 bg-background border border-border px-1.5 py-1 rounded-md text-xs text-right focus:ring-1 focus:ring-yellow-500 outline-none"
                      />
                      {fijado ? (
                        <button type="button" onClick={() => liberar(t.id)} title="Volver a automático" className="text-yellow-500 hover:text-yellow-400">
                          <Lock className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <Unlock className="h-3.5 w-3.5 text-muted-foreground/40" />
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-border px-3 py-2">
            {excede ? (
              <p className="text-xs text-destructive font-medium">
                Los valores fijados (${sumaFijados.toLocaleString("es-CO")}) superan el total (${totalRedondeado.toLocaleString("es-CO")}).
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Suma total: {formatCurrency(distribucion.reduce((s, d) => s + d.valor, 0))}</p>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}