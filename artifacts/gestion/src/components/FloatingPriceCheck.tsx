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

  // Close dropdown on scroll only when scroll happens outside the portal
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
    if (lineas.length >= 5) return;
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
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="mb-4 w-[420px] sm:w-[520px] bg-card border border-border shadow-2xl rounded-2xl flex flex-col"
          >
            <div className="bg-muted px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
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

            <div className="p-4 space-y-4 max-h-[580px] overflow-y-auto">
              {lineas.map((linea, i) => {
                const calc = calcLine(linea);
                const opts = filteredProductos(i);
                const hasQ = busquedas[i]?.length > 0;
                return (
                  <div key={i} className="space-y-2">
                    <div className="flex gap-2 items-start">
                      <div className="flex-1 relative">
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
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={linea.cantidad}
                        onChange={(e) => updateCantidad(i, e.target.value)}
                        className="w-16 bg-background border border-border px-2 py-2 rounded-lg text-sm text-center focus:ring-1 focus:ring-green-500 outline-none"
                        placeholder="1"
                      />
                      {lineas.length > 1 && (
                        <button
                          onClick={() => removeLinea(i)}
                          className="p-2 text-muted-foreground hover:text-destructive rounded-lg transition-colors flex-shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {calc && (
                      <div className="bg-background rounded-lg border border-border px-3 py-2 text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">P. Compra unitario</span>
                          <span className="font-medium">{formatCurrency(calc.prod.precioCompra)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">P. Venta s/IVA unitario</span>
                          <span className="font-medium">{formatCurrency(calc.prod.precioVentaSinIva)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">P. Venta c/IVA unitario</span>
                          <span className="text-green-500 font-bold">{formatCurrency(calc.prod.precioVentaConIva)}</span>
                        </div>
                        {calc.cant > 1 && (
                          <>
                            <div className="border-t border-border mt-1 pt-1 flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider">
                              × {calc.cant} unidades
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Subtotal Compra</span>
                              <span>{formatCurrency(calc.subtotalCompra)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Subtotal s/IVA</span>
                              <span>{formatCurrency(calc.subtotalSinIva)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Subtotal c/IVA</span>
                              <span className="text-green-500 font-bold">{formatCurrency(calc.subtotalConIva)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Portal dropdown — renders at body level, escapes overflow */}
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

              {lineas.length < 5 && (
                <button
                  onClick={addLinea}
                  className="w-full py-2.5 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground hover:border-green-500 transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Agregar producto ({lineas.length}/5)
                </button>
              )}
            </div>

            {calcLines.length > 0 && (
              <div className="border-t-2 border-border bg-muted/50 px-4 py-3 space-y-1.5 flex-shrink-0">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Gran Total</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground text-xs">Total Compra</span>
                  <span className="text-xs font-medium">{formatCurrency(grandTotalCompra)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground text-xs">Total Venta s/IVA</span>
                  <span className="text-xs font-medium">{formatCurrency(grandTotalSinIva)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-border pt-1.5 mt-1">
                  <span className="text-xs font-bold text-foreground">Total Venta c/IVA</span>
                  <span className="font-bold text-green-500">{formatCurrency(grandTotalConIva)}</span>
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
