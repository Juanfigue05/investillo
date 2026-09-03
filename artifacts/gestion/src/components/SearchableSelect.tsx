import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export interface ProductoOpcion {
  id: string;
  nombre: string;
  codigo?: string;
  marca?: string;
  precioCompra?: number;
  precioVenta?: number;
  stockActual?: number;
  stockMinimo?: number;
  special?: "manoobra" | "abono";
}

export function SearchableSelect({
  opciones,
  value,
  onChange,
  placeholder,
}: {
  opciones: ProductoOpcion[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);

  const selected = opciones.find((o) => o.id === value);

  const filtered = busqueda.trim()
    ? opciones.filter((o) => {
        const q = busqueda.toLowerCase();
        return (
          o.nombre.toLowerCase().includes(q) ||
          (o.marca || "").toLowerCase().includes(q) ||
          (o.codigo || "").toLowerCase().includes(q)
        );
      })
    : opciones;

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
    const close = (e: Event) => {
      if (portalRef.current && portalRef.current.contains(e.target as Node)) return;
      setOpen(false); setBusqueda("");
    };
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setBusqueda("");
  };

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      setDropdownRect(triggerRef.current.getBoundingClientRect());
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
            top: dropdownRect.bottom + 4,
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
              placeholder="Buscar por nombre, código o marca..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full bg-background border border-border px-3 py-1.5 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-center py-4 text-muted-foreground text-sm">Sin resultados</p>
            ) : (
              filtered.map((o) => {
                const sinStock = o.stockActual === 0;
                const pocoStock = !sinStock && o.stockActual !== undefined && o.stockMinimo !== undefined && o.stockActual <= o.stockMinimo;
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
                        <span className="text-sm font-bold text-primary flex-shrink-0">{formatCurrency(o.precioVenta)}</span>
                      )}
                    </div>
                    {(o.codigo || o.marca || o.stockActual !== undefined) && (
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        {o.codigo && <span className="font-mono">{o.codigo}</span>}
                        {o.marca && <span>· {o.marca}</span>}
                        {o.stockActual !== undefined && (
                          <span className={sinStock ? "text-destructive font-medium" : pocoStock ? "text-amber-400 font-medium" : ""}>
                            · Stock: {o.stockActual}{sinStock ? " ⚠ Sin existencias" : pocoStock ? " ⚠ Poco stock" : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}