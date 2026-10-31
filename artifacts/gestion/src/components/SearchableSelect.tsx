import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { coincideBusqueda, formatCurrencyDecimal } from "@/lib/utils";

export interface ProductoOpcion {
  id: string;
  nombre: string;
  codigo?: string;
  marca?: string;
  tipo?: string;
  referencia?: string;
  adicional?: string;
  precioCompra?: number;
  precioVenta?: number;
  stockActual?: number;
  stockMinimo?: number;
  special?: "manoobra" | "abono";
}

type CampoDetalle = "codigo" | "marca" | "tipo" | "referencia" | "adicional" | "stock";

export function SearchableSelect({
  opciones,
  value,
  onChange,
  placeholder,
  allowCustom = false,
  camposDetalle = ["codigo", "marca", "referencia", "tipo", "adicional", "stock"],
}: {
  opciones: ProductoOpcion[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  allowCustom?: boolean;
  camposDetalle?: CampoDetalle[];
}) {
  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);
  const [openAbove, setOpenAbove] = useState(false);

  const selected = opciones.find((o) => o.id === value);
  const updatePosition = () => {
    if (triggerRef.current) setDropdownRect(triggerRef.current.getBoundingClientRect());
  };

  const filtered = opciones.filter((o) =>
    coincideBusqueda(busqueda, o.nombre, o.codigo, o.marca, o.tipo, o.referencia, o.adicional),
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        !(portalRef.current && portalRef.current.contains(target))
      ) {
        setOpen(false);
        setBusqueda("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setBusqueda("");
  };

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownRect(rect);
      setOpenAbove(rect.bottom + 420 > window.innerHeight && rect.top > 220);
    }
    setOpen((prev) => !prev);
    if (!open) setBusqueda("");
  };

  return (
    <div ref={containerRef} className="relative w-full min-w-[160px]">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none text-left"
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected ? selected.nombre : placeholder || "Seleccionar..."}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-2" />
      </button>

      {open && dropdownRect && createPortal(
        <div
          ref={(el) => { portalRef.current = el; }}
          style={{
            position: "fixed",
            top: openAbove ? undefined : dropdownRect.bottom + 4,
            bottom: openAbove ? window.innerHeight - dropdownRect.top + 4 : undefined,
            left: dropdownRect.left,
            width: Math.max(dropdownRect.width, 420),
            maxWidth: "min(520px, 92vw)",
            zIndex: 9999,
          }}
          className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        >
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              type="text"
              placeholder="Buscar por nombre, código, referencia, tipo o marca..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full bg-background border border-border px-3 py-1.5 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          <div className="max-h-[51vh] overflow-y-auto">
            {filtered.length === 0 ? (
              allowCustom && busqueda.trim() ? (
                <button type="button" onClick={() => handleSelect(busqueda.trim())} className="w-full text-left px-3 py-3 text-sm text-primary hover:bg-muted">
                  Usar “{busqueda.trim()}”
                </button>
              ) : <p className="text-center py-4 text-muted-foreground text-sm">Sin resultados</p>
            ) : (
              <>
              <p className="sticky top-0 z-10 bg-card px-3 py-1 text-[10px] text-muted-foreground border-b border-border">
                {filtered.length} resultado{filtered.length === 1 ? "" : "s"}
              </p>
              {filtered.map((o) => {
                const sinStock = o.stockActual === 0;
                const pocoStock = !sinStock && o.stockActual !== undefined && o.stockMinimo !== undefined && o.stockActual <= o.stockMinimo;
                const detalles = camposDetalle.flatMap((campo) => {
                  if (campo === "stock") {
                    return o.stockActual === undefined ? [] : [{
                      valor: `Stock: ${o.stockActual}${sinStock ? " ⚠ Sin existencias" : pocoStock ? " ⚠ Poco stock" : ""}`,
                      className: sinStock ? "text-destructive font-medium" : pocoStock ? "text-amber-400 font-medium" : "",
                    }];
                  }
                  const valor = o[campo];
                  if (!valor) return [];
                  return [{
                    valor: campo === "referencia" ? `Ref: ${valor}` : valor,
                    className: campo === "codigo" ? "font-mono" : "",
                  }];
                });
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => handleSelect(o.id)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-muted transition-colors border-b border-border/40 last:border-0 ${
                      o.special === "manoobra" ? "text-yellow-400" :
                      o.special === "abono" ? "text-blue-400" : "text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{o.nombre}</span>
                      {o.precioVenta !== undefined && (
                        <span className="text-sm font-bold text-primary flex-shrink-0">{formatCurrencyDecimal(o.precioVenta)}</span>
                      )}
                    </div>
                    {detalles.length > 0 && (
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        {detalles.map((detalle, indice) => (
                          <span key={indice}>
                            {indice > 0 && " · "}
                            <span className={detalle.className}>{detalle.valor}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
              </>
            )}
            {allowCustom && busqueda.trim() && filtered.length > 0 && !selected && (
              <button type="button" onClick={() => handleSelect(busqueda.trim())} className="w-full text-left px-3 py-3 text-sm text-primary hover:bg-muted border-t border-border">
                Usar “{busqueda.trim()}”
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}