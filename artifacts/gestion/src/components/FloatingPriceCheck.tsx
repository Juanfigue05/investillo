import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Calculator, Minus, X, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useGetInventario } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";

interface LineaConsulta {
  productoId: string;
  cantidad: string;
}

export function FloatingPriceCheck() {
  const [isOpen, setIsOpen] = useState(false);
  const [lineas, setLineas] = useState<LineaConsulta[]>([{ productoId: "", cantidad: "1" }]);
  const [busquedas, setBusquedas] = useState<string[]>([""]);
  const [dropdownOpen, setDropdownOpen] = useState<number | null>(null);
  const { data: productos } = useGetInventario();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        !(portalRef.current && portalRef.current.contains(target))
      ) {
        setDropdownOpen(null);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (dropdownOpen === null) return;
    const close = (e: Event) => {
      if (portalRef.current && portalRef.current.contains(e.target as Node)) return;
      setDropdownOpen(null);
    };
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [dropdownOpen]);

  const openDropdown = (i: number) => {
    const el = inputRefs.current[i];
    if (el) {
      const rect = el.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    setDropdownOpen(i);
  };

  const addLinea = () => {
    if (lineas.length >= 6) return;
    setLineas((prev) => [...prev, { productoId: "", cantidad: "1" }]);
    setBusquedas((prev) => [...prev, ""]);
  };

  const removeLinea = (i: number) => {
    setLineas((prev) => prev.filter((_, idx) => idx !== i));
    setBusquedas((prev) => prev.filter((_, idx) => idx !== i));
    setDropdownOpen(null);
  };

  const updateCantidad = (i: number, val: string) => {
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, cantidad: val } : l)));
  };

  const updateBusqueda = (i: number, val: string) => {
    setBusquedas((prev) => prev.map((b, idx) => (idx === i ? val : b)));
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, productoId: "" } : l)));
    openDropdown(i);
  };

  const selectProducto = (i: number, productoId: string, nombre: string) => {
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, productoId } : l)));
    setBusquedas((prev) => prev.map((b, idx) => (idx === i ? nombre : b)));
    setDropdownOpen(null);
  };

  const filteredProductos = (i: number) => {
    const q = busquedas[i]?.toLowerCase() || "";
    return (productos || [])
      .filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.codigo.toLowerCase().includes(q) ||
          (p.marca || "").toLowerCase().includes(q)
      )
      .slice(0, 10);
  };

  const calcLine = (linea: LineaConsulta) => {
    const prod = productos?.find((p) => String(p.id) === linea.productoId);
    if (!prod) return null;
    const cant = parseFloat(linea.cantidad) || 1;
    return {
      prod,
      cant,
      subtotalCompra: prod.precioCompra * cant,
      subtotalSinIva: prod.precioVentaSinIva * cant,
      subtotalConIva: prod.precioVentaConIva * cant,
    };
  };

  const calcLines = lineas.map(calcLine).filter(Boolean) as NonNullable<ReturnType<typeof calcLine>>[];
  const grandTotalCompra = calcLines.reduce((s, l) => s + l.subtotalCompra, 0);
  const grandTotalSinIva = calcLines.reduce((s, l) => s + l.subtotalSinIva, 0);
  const grandTotalConIva = calcLines.reduce((s, l) => s + l.subtotalConIva, 0);

  return (
    <div ref={containerRef} className="flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="mb-4 w-[680px] bg-card border border-border shadow-2xl rounded-2xl flex flex-col"
            style={{ maxHeight: "min(600px, calc(100vh - 120px))" }}
          >
            {/* Header — always visible, never scrolls */}
            <div className="bg-muted px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0 rounded-t-2xl">
              <div className="flex items-center gap-2 text-foreground font-medium text-sm">
                <Calculator className="w-4 h-4 text-green-500" />
                Consulta Rápida de Precios
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-background rounded-md transition-colors"
                title="Minimizar"
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>

            {/* Column headers */}
            <div className="px-4 pt-3 pb-1.5 grid grid-cols-[1fr_52px_168px_20px] gap-x-3 flex-shrink-0">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Producto</span>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Cant.</span>
              <div className="grid grid-cols-3 gap-x-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">P. Compra</span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">s/IVA</span>
                <span className="text-[10px] font-semibold text-green-600 uppercase tracking-wider text-right">c/IVA</span>
              </div>
              <span />
            </div>

            {/* Scrollable product rows */}
            <div className="px-4 pb-2 space-y-2 overflow-y-auto flex-1 min-h-0">
              {lineas.map((linea, i) => {
                const calc = calcLine(linea);
                const opts = filteredProductos(i);
                const hasQ = busquedas[i]?.length > 0;
                const cant = parseFloat(linea.cantidad) || 1;

                return (
                  <div key={i} className="space-y-1">
                    {/* Main row: product | qty | prices | remove */}
                    <div className="grid grid-cols-[1fr_52px_168px_20px] gap-x-3 items-center">
                      {/* Product search */}
                      <div className="relative">
                        <input
                          ref={(el) => { inputRefs.current[i] = el; }}
                          type="text"
                          placeholder="Buscar producto..."
                          value={busquedas[i]}
                          onChange={(e) => updateBusqueda(i, e.target.value)}
                          onFocus={() => openDropdown(i)}
                          className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-green-500 outline-none"
                        />
                      </div>

                      {/* Quantity */}
                      <input
                        type="number"
                        min="0.25"
                        step="0.25"
                        value={linea.cantidad}
                        onChange={(e) => updateCantidad(i, e.target.value)}
                        className="w-full bg-background border border-border px-2 py-2 rounded-lg text-sm text-center focus:ring-1 focus:ring-green-500 outline-none"
                        placeholder="1"
                      />

                      {/* Prices — 3 columns: compra, s/IVA, c/IVA */}
                      {calc ? (
                        <div className="grid grid-cols-3 gap-x-1 text-xs">
                          <span className="text-right text-muted-foreground font-medium tabular-nums">
                            {formatCurrency(calc.prod.precioCompra)}
                          </span>
                          <span className="text-right text-muted-foreground font-medium tabular-nums">
                            {formatCurrency(calc.prod.precioVentaSinIva)}
                          </span>
                          <span className="text-right text-green-500 font-bold tabular-nums">
                            {formatCurrency(calc.prod.precioVentaConIva)}
                          </span>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground/40 text-center col-span-1">—</div>
                      )}

                      {/* Remove */}
                      {lineas.length > 1 ? (
                        <button
                          onClick={() => removeLinea(i)}
                          className="p-0.5 text-muted-foreground hover:text-destructive rounded transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>

                    {/* Subtotals row — only when qty > 1 and product selected */}
                    {calc && cant > 1 && (
                      <div className="grid grid-cols-[1fr_52px_168px_20px] gap-x-3">
                        <div className="text-[10px] text-muted-foreground pl-1">
                          × {cant} unidades
                        </div>
                        <span />
                        <div className="grid grid-cols-3 gap-x-1 text-[10px]">
                          <span className="text-right text-muted-foreground tabular-nums">
                            {formatCurrency(calc.subtotalCompra)}
                          </span>
                          <span className="text-right text-muted-foreground tabular-nums">
                            {formatCurrency(calc.subtotalSinIva)}
                          </span>
                          <span className="text-right text-green-500 font-semibold tabular-nums">
                            {formatCurrency(calc.subtotalConIva)}
                          </span>
                        </div>
                        <span />
                      </div>
                    )}

                    {/* Portal dropdown */}
                    {dropdownOpen === i && hasQ && opts.length > 0 && dropdownPos && createPortal(
                      <div
                        ref={(el) => { portalRef.current = el; }}
                        style={{
                          position: "fixed",
                          top: dropdownPos.top,
                          left: dropdownPos.left,
                          width: dropdownPos.width,
                          zIndex: 9999,
                        }}
                        className="bg-card border border-border rounded-lg shadow-2xl overflow-hidden max-h-52 overflow-y-auto"
                      >
                        {opts.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); selectProducto(i, String(p.id), p.nombre); }}
                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors border-b border-border/40 last:border-0"
                          >
                            <span className="font-medium text-foreground">{p.nombre}</span>
                            {p.marca && <span className="text-muted-foreground ml-1.5 text-xs">— {p.marca}</span>}
                          </button>
                        ))}
                      </div>,
                      document.body
                    )}
                  </div>
                );
              })}

              {/* Add product button */}
              {lineas.length < 6 && (
                <button
                  onClick={addLinea}
                  className="w-full py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground hover:border-green-500 transition-colors flex items-center justify-center gap-1 mt-1"
                >
                  <Plus className="w-3 h-3" />
                  Agregar producto ({lineas.length}/6)
                </button>
              )}
            </div>

            {/* Grand total — always visible at bottom */}
            {calcLines.length > 0 && (
              <div className="border-t-2 border-border bg-muted/50 px-4 py-3 flex-shrink-0 rounded-b-2xl">
                <div className="grid grid-cols-[1fr_52px_168px_20px] gap-x-3 items-center">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Gran Total</p>
                  <span />
                  <div className="grid grid-cols-3 gap-x-1">
                    <span className="text-right text-xs font-medium tabular-nums">{formatCurrency(grandTotalCompra)}</span>
                    <span className="text-right text-xs font-medium tabular-nums">{formatCurrency(grandTotalSinIva)}</span>
                    <span className="text-right text-sm font-bold text-green-500 tabular-nums">{formatCurrency(grandTotalConIva)}</span>
                  </div>
                  <span />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative group/price">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-14 h-14 bg-green-600 text-white rounded-full shadow-xl flex items-center justify-center hover:scale-105 hover:shadow-green-600/30 transition-all duration-200 active:scale-95"
          aria-label="Consultar precios"
        >
          <Calculator className="w-6 h-6" />
        </button>
        <span className="absolute right-16 top-1/2 -translate-y-1/2 bg-card border border-border text-foreground text-xs font-medium px-2.5 py-1 rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover/price:opacity-100 transition-opacity pointer-events-none">
          Consultar Precios
        </span>
      </div>
    </div>
  );
}
