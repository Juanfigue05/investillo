import React, { useState, useMemo, useRef, useEffect } from "react";
import { Layout } from "@/components/Layout";
import {
  useGetInventario,
  useCrearProducto,
  useActualizarProducto,
  useEliminarProducto,
} from "@workspace/api-client-react";
import { formatCurrency, calcularPrecioConIva } from "@/lib/utils";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Filter,
  X,
  ChevronDown as ChevDown,
  Upload,
  CheckCircle2,
  Loader2,
  FileDown,
  GitMerge,
  ArrowRightLeft,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { encolarOperacion } from "@/lib/offline-db";
import { toast } from "@/hooks/use-toast";
import { RemachadasPanel } from "@/components/RemachadasPanel";
import { esFalloDeRed } from "@/lib/offline-db";
import {
  SearchableSelect,
  type ProductoOpcion,
} from "@/components/SearchableSelect";

const API = `${import.meta.env.BASE_URL}api`
  .replace(/\/+/g, "/")
  .replace(/\/$/, "");

function agregarFilaOptimista(
  queryClient: any,
  queryKey: readonly unknown[],
  fila: any,
) {
  const idTemporal = -Date.now() - Math.random();
  queryClient.setQueryData(queryKey, (old: any[] = []) => [
    ...(old || []),
    { id: idTemporal, ...fila, _pendiente: true },
  ]);
}

interface ParsedRow {
  codigo: string;
  nombre: string;
  referencia: string | null;
  marca: string | null;
  precioCompra: string;
  precioVentaSinIva: string;
  precioVentaConIva: string;
  cantidad?: number | null;
}

interface ConflictoItem {
  codigo: string;
  opcionA: ParsedRow;
  opcionB: ParsedRow;
}

interface ImportResult {
  ok: boolean;
  total: number;
  procesados: number;
  omitidos: number;
  conflictos?: ConflictoItem[];
  productosNuevos?: ParsedRow[];
  error?: string;
}

interface ConflictoCantidad {
  codigo: string;
  nombre: string;
  stockActual: number;
  cantidadArchivo: number;
}

const fmtP = (v: string) => {
  const n = parseFloat(v);
  return isNaN(n) ? "—" : `$${n.toLocaleString("es-CO")}`;
};

type SortCol =
  | "codigo"
  | "nombre"
  | "marca"
  | "tipo"
  | "precioCompra"
  | "precioVentaConIva"
  | "stockActual";
type SortDir = "asc" | "desc";

function SortIcon({
  col,
  sortCol,
  sortDir,
}: {
  col: SortCol;
  sortCol: SortCol;
  sortDir: SortDir;
}) {
  if (sortCol !== col)
    return <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />;
  return sortDir === "asc" ? (
    <ChevronUp className="w-3.5 h-3.5 text-primary" />
  ) : (
    <ChevronDown className="w-3.5 h-3.5 text-primary" />
  );
}

interface FilterPanel {
  marcas: string[];
  tipos: string[];
  marcaBusqueda: string;
  tipoBusqueda: string;
  estadoStock: "todos" | "activos" | "inactivos" | "bajo" | "sin";
}

export default function Inventario() {
  const [productosNuevos, setProductosNuevos] = useState<ParsedRow[]>([]);
  const [confirmandoNuevos, setConfirmandoNuevos] = useState(false);
  const [conflictosCantidad, setConflictosCantidad] = useState<
    ConflictoCantidad[]
  >([]);
  const [resolviendoCantidad, setResolviendoCantidad] = useState(false);
  const [cantidadResueltaOk, setCantidadResueltaOk] = useState(false);
  const { data: productos, isLoading } = useGetInventario();
  const [productosTodos, setProductosTodos] = useState<any[]>([]);
  const queryClient = useQueryClient();
  const crearMutation = useCrearProducto();
  const actualizarMutation = useActualizarProducto();
  const eliminarMutation = useEliminarProducto();
  const [showTrasladar, setShowTrasladar] = useState(false);
  const [trasladarProductoId, setTrasladarProductoId] = useState("");
  const [trasladarCantidad, setTrasladarCantidad] = useState("");
  const [trasladando, setTrasladando] = useState(false);
  const [direccionTraslado, setDireccionTraslado] = useState<"bodega-local" | "local-bodega">("bodega-local");
  const [vista, setVista] = useState<"productos" | "remachadas">("productos");

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>("nombre");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterPanel>({
    marcas: [],
    tipos: [],
    marcaBusqueda: "",
    tipoBusqueda: "",
    estadoStock: "activos",
  });

  useEffect(() => {
    fetch(`${API}/inventario?incluirInactivos=true`)
      .then((res) => res.json())
      .then((data) => setProductosTodos(Array.isArray(data) ? data : []))
      .catch(() => setProductosTodos(productos || []));
  }, [productos]);

  // Pagination
  const PAGE_SIZES = [20, 50, 100, 150] as const;
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filters, sortCol, sortDir]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputCompletoRef = useRef<HTMLInputElement>(null);
  const [previsualizando, setPrevisualizando] = useState(false);
  const [aplicandoCompleto, setAplicandoCompleto] = useState(false);
  const [previewCompleto, setPreviewCompleto] = useState<{
    totalEnArchivo: number;
    sinCambios: number;
    omitidosSinNombre: number;
    cambios: { codigo: string; nombre: string; esNuevo: boolean; cambios: { campo: string; actual: string; nuevo: string }[] }[];
    filasParaAplicar: any[];
  } | null>(null);
  const [resultadoAplicado, setResultadoAplicado] = useState<{ actualizados: number; creados: number } | null>(null);
  const [importando, setImportando] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // conflict resolution state
  const [conflictos, setConflictos] = useState<ConflictoItem[]>([]);
  const [choices, setChoices] = useState<Record<string, "A" | "B" | "C">>({});
  const [newCodes, setNewCodes] = useState<Record<string, string>>({}); // codigo → nuevo código para opción C
  const [resolviendo, setResolviendo] = useState(false);
  const [resolvedOk, setResolvedOk] = useState(false);

    const handlePrevisualizar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setPrevisualizando(true);
    setPreviewCompleto(null);
    setResultadoAplicado(null);
    try {
      const form = new FormData();
      form.append("archivo", file);
      const res = await fetch(`${API}/inventario-import/previsualizar`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al previsualizar");
      setPreviewCompleto(data);
    } catch (err) {
      alert("Error: " + err);
    } finally {
      setPrevisualizando(false);
    }
  };

  const handleAplicarCompleto = async () => {
    if (!previewCompleto?.filasParaAplicar.length) return;
    setAplicandoCompleto(true);
    try {
      const res = await fetch(`${API}/inventario-import/aplicar-completo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filas: previewCompleto.filasParaAplicar }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al aplicar");
      setResultadoAplicado({ actualizados: data.actualizados, creados: data.creados });
      setPreviewCompleto(null);
      queryClient.invalidateQueries({ queryKey: ["/api/inventario"] });
    } catch (err) {
      alert("Error al aplicar los cambios: " + err);
    } finally {
      setAplicandoCompleto(false);
    }
  };

  const handleTrasladar = async () => {
    if (!trasladarProductoId || !trasladarCantidad) return;
    setTrasladando(true);
    try {
      const res = await fetch(
        `${API}/inventario/${trasladarProductoId}/trasladar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cantidad: parseFloat(trasladarCantidad),
            direccion: direccionTraslado,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "No se pudo trasladar");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/inventario"] });
      setShowTrasladar(false);
      setTrasladarProductoId("");
      setTrasladarCantidad("");
    } finally {
      setTrasladando(false);
    }
  };

  const productoTrasladar = productos?.find(
    (p) => String(p.id) === trasladarProductoId,
  );

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImportando(true);
    setImportResult(null);
    setConflictos([]);
    setChoices({});
    setNewCodes({});
    setResolvedOk(false);
    setConflictosCantidad([]);
    setProductosNuevos([]);
    try {
      const form = new FormData();
      form.append("archivo", file);
      const res = await fetch(`${API}/inventario-import`, {
        method: "POST",
        body: form,
      });
      const data: ImportResult = await res.json();
      if (!res.ok) throw new Error((data as any).error || "Error desconocido");
      setImportResult(data);
      if (data.conflictos?.length) {
        setConflictos(data.conflictos);
        const init: Record<string, "A" | "B" | "C"> = {};
        data.conflictos.forEach((c) => {
          init[c.codigo] = "A";
        });
        setChoices(init);
      }
      if ((data as any).conflictosCantidad?.length) {
        setConflictosCantidad((data as any).conflictosCantidad);
        setCantidadResueltaOk(false);
      }
      setProductosNuevos(data.productosNuevos ?? []);
      queryClient.invalidateQueries({ queryKey: ["inventario"] });
    } catch (err) {
      setImportResult({
        ok: false,
        total: 0,
        procesados: 0,
        omitidos: 0,
        error: String(err),
      });
    } finally {
      setImportando(false);
    }
  };

  /** Confirma la creación de los productos nuevos encontrados en el Excel. */
  const handleConfirmarNuevos = async () => {
    if (!productosNuevos.length) return;
    setConfirmandoNuevos(true);
    try {
      const res = await fetch(`${API}/inventario-import/confirmar-nuevos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: productosNuevos }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setProductosNuevos([]);
      queryClient.invalidateQueries({ queryKey: ["/api/inventario"] });
      toast({
        title: "Productos creados",
        description: "Los productos nuevos fueron agregados al inventario.",
      });
    } catch (err) {
      toast({
        title: "No se pudieron crear",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setConfirmandoNuevos(false);
    }
  };

  const handleResolverCantidad = async (modo: "sumar" | "reemplazar") => {
    setResolviendoCantidad(true);
    try {
      const res = await fetch(`${API}/inventario-import/resolver-cantidades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modo,
          items: conflictosCantidad.map((c) => ({
            codigo: c.codigo,
            cantidadArchivo: c.cantidadArchivo,
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setCantidadResueltaOk(true);
      setConflictosCantidad([]);
      queryClient.invalidateQueries({ queryKey: ["inventario"] });
    } catch (err) {
      alert("Error al aplicar la decisión: " + err);
    } finally {
      setResolviendoCantidad(false);
    }
  };

  const handleResolver = async () => {
    // Validate "C" selections: new code must be non-empty and different from original
    for (const c of conflictos) {
      if (choices[c.codigo] === "C") {
        const nc = (newCodes[c.codigo] ?? "").trim();
        if (!nc) {
          alert(
            `El código ${c.codigo}: debes escribir un código nuevo antes de continuar.`,
          );
          return;
        }
        if (nc === c.codigo) {
          alert(
            `El código ${c.codigo}: el código nuevo no puede ser igual al original.`,
          );
          return;
        }
      }
    }

    // B: upsert with same code (replaces A)
    const itemsB = conflictos
      .filter((c) => choices[c.codigo] === "B")
      .map((c) => c.opcionB);

    // C: insert with NEW code (creates separate product)
    const itemsC = conflictos
      .filter((c) => choices[c.codigo] === "C")
      .map((c) => ({
        ...c.opcionB,
        codigo: (newCodes[c.codigo] ?? "").trim(),
      }));

    const items = [...itemsB, ...itemsC];

    setResolviendo(true);
    try {
      if (items.length > 0) {
        const res = await fetch(`${API}/inventario-import/resolver`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
      }
      setResolvedOk(true);
      setConflictos([]);
      queryClient.invalidateQueries({ queryKey: ["inventario"] });
    } catch (err) {
      alert("Error al aplicar selecciones: " + err);
    } finally {
      setResolviendo(false);
    }
  };

  const [formData, setFormData] = useState({
    nombre: "",
    codigo: "",
    marca: "",
    tipo: "",
    referencia: "",
    adicional: "",
    precioCompra: 0,
    precioVentaSinIva: 0,
    tieneIva: false,
    stockActual: 0,
    stockLocal: 0,
    stockBodega: 0,
    stockMinimo: 0,
    activo: true,
  });

  // Unique marcas and tipos from inventory
  const allMarcas = useMemo(
    () =>
      [
        ...new Set(
          (productosTodos.length ? productosTodos : productos || [])
            .map((p) => p.marca)
            .filter(Boolean) as string[],
        ),
      ].sort(),
    [productos, productosTodos],
  );
  const allTipos = useMemo(
    () =>
      [
        ...new Set(
          (productosTodos.length ? productosTodos : productos || [])
            .map((p) => (p as any).tipo)
            .filter(Boolean) as string[],
        ),
      ].sort(),
    [productos, productosTodos],
  );

  const filteredMarcas = allMarcas.filter((m) =>
    m.toLowerCase().includes(filters.marcaBusqueda.toLowerCase()),
  );
  const filteredTipos = allTipos.filter((t) =>
    t.toLowerCase().includes(filters.tipoBusqueda.toLowerCase()),
  );

  const toggleMarca = (m: string) =>
    setFilters((f) => ({
      ...f,
      marcas: f.marcas.includes(m)
        ? f.marcas.filter((x) => x !== m)
        : [...f.marcas, m],
    }));
  const toggleTipo = (t: string) =>
    setFilters((f) => ({
      ...f,
      tipos: f.tipos.includes(t)
        ? f.tipos.filter((x) => x !== t)
        : [...f.tipos, t],
    }));
  const clearFilters = () =>
    setFilters({
      marcas: [],
      tipos: [],
      marcaBusqueda: "",
      tipoBusqueda: "",
      estadoStock: "activos",
    });

  const activeFilterCount =
    filters.marcas.length +
    filters.tipos.length +
    (filters.estadoStock !== "todos" ? 1 : 0);

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const filteredProductos = useMemo(() => {
    return (productosTodos.length ? productosTodos : productos || [])
      .filter((p) => {
        const q = search.toLowerCase();
        const matchSearch =
          !q ||
          p.nombre.toLowerCase().includes(q) ||
          p.codigo.toLowerCase().includes(q) ||
          (p.marca || "").toLowerCase().includes(q) ||
          ((p as any).tipo || "").toLowerCase().includes(q) ||
          (p.referencia || "").toLowerCase().includes(q);
        const matchMarca =
          filters.marcas.length === 0 || filters.marcas.includes(p.marca || "");
        const matchTipo =
          filters.tipos.length === 0 ||
          filters.tipos.includes((p as any).tipo || "");
        const matchStock =
          filters.estadoStock === "todos"
            ? true
            : filters.estadoStock === "activos"
              ? (p as any).activo !== false
              : filters.estadoStock === "inactivos"
                ? (p as any).activo === false
                : filters.estadoStock === "sin"
                  ? p.stockActual === 0
                  : p.stockActual > 0 && p.stockActual <= p.stockMinimo;
        return matchSearch && matchMarca && matchTipo && matchStock;
      })
      .sort((a, b) => {
        let av: any = (a as any)[sortCol];
        let bv: any = (b as any)[sortCol];
        if (typeof av === "string") av = av.toLowerCase();
        if (typeof bv === "string") bv = bv.toLowerCase();
        if (av === null || av === undefined) av = "";
        if (bv === null || bv === undefined) bv = "";
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
  }, [productos, productosTodos, search, filters, sortCol, sortDir]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProductos.length / pageSize),
  );
  const paginatedProductos = filteredProductos.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const openEdit = (prod: any) => {
    setFormData({
      nombre: prod.nombre,
      codigo: prod.codigo,
      marca: prod.marca || "",
      tipo: prod.tipo || "",
      referencia: prod.referencia || "",
      adicional: prod.adicional || "",
      precioCompra: prod.precioCompra,
      precioVentaSinIva: prod.precioVentaSinIva,
      tieneIva: prod.tieneIva,
      stockActual: prod.stockActual,
      stockLocal: (prod as any).stockLocal ?? 0,
      stockBodega: (prod as any).stockBodega ?? 0,
      stockMinimo: prod.stockMinimo,
      activo: (prod as any).activo !== false,
    });
    setEditingId(prod.id);
    setShowForm(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      actualizarMutation.mutate(
        { id: editingId, data: formData },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/inventario"] });
            setShowForm(false);
          },
          onError: async (error) => {
            if (!esFalloDeRed(error)) {
              toast({
                title: "No se pudo guardar",
                description:
                  error instanceof Error ? error.message : String(error),
                variant: "destructive",
              });
              return;
            }
            await encolarOperacion({
              tipo: "producto",
              metodo: "PUT",
              endpoint: `/inventario/${editingId}`,
              payload: formData,
            });
            toast({
              title: "Guardado sin conexión",
              description:
                "Este producto se sincronizará automáticamente cuando vuelva internet.",
            });
            setShowForm(false);
          },
        },
      );
    } else {
      agregarFilaOptimista(queryClient, ["/api/inventario"], formData);

      crearMutation.mutate(
        { data: formData },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/inventario"] });
            setShowForm(false);
          },
          onError: async (error) => {
            if (!esFalloDeRed(error)) {
              toast({
                title: "No se pudo guardar",
                description:
                  error instanceof Error ? error.message : String(error),
                variant: "destructive",
              });
              return;
            }
            await encolarOperacion({
              tipo: "producto",
              metodo: "POST",
              endpoint: "/inventario",
              payload: formData,
            });
            toast({
              title: "Guardado sin conexión",
              description:
                "Este producto se sincronizará automáticamente cuando vuelva internet.",
            });
            setShowForm(false);
          },
        },
      );
    }
  };

  const handleDelete = (id: number) => {
    if (
      confirm(
        "¿Quieres inactivar este producto? Dejará de aparecer en los selectores.",
      )
    ) {
      eliminarMutation.mutate(
        { id },
        {
          onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: ["/api/inventario"] }),
        },
      );
    }
  };

  const handleReactivar = async (id: number) => {
    try {
      const res = await fetch(`${API}/inventario/${id}/reactivar`, {
        method: "PUT",
      });
      if (!res.ok)
        throw new Error((await res.json()).error || "No se pudo reactivar");
      queryClient.invalidateQueries({ queryKey: ["/api/inventario"] });
      const todos = await fetch(`${API}/inventario?incluirInactivos=true`).then(
        (r) => r.json(),
      );
      setProductosTodos(Array.isArray(todos) ? todos : []);
    } catch (err) {
      toast({
        title: "No se pudo reactivar",
        description: String(err),
        variant: "destructive",
      });
    }
  };

  const margen =
    formData.precioCompra > 0
      ? ((formData.precioVentaSinIva - formData.precioCompra) /
          formData.precioCompra) *
        100
      : 0;
  const precioConIva = formData.tieneIva
    ? calcularPrecioConIva(formData.precioVentaSinIva)
    : formData.precioVentaSinIva;

  const thClass =
    "px-3 py-3 font-medium cursor-pointer select-none hover:bg-muted/70 transition-colors whitespace-nowrap text-xs lg:text-sm";

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">
              Inventario
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Gestiona tus productos, precios y alertas de stock.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {/* Download template */}
            <a
              href={`${API}/inventario-import/template-completa`}
              download="plantilla_inventario_completa.xlsx"
              className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border text-foreground rounded-xl font-medium hover:bg-muted transition-all shadow-md whitespace-nowrap text-sm"
            >
              <FileDown className="w-4 h-4 text-green-400" />
              Descargar Plantilla
            </a>

            <a
              href={`${API}/inventario-import/exportar-completo`}
              download="inventario_completo.xlsx"
              className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border text-foreground rounded-xl font-medium hover:bg-muted transition-all shadow-md whitespace-nowrap text-sm"
            >
              <FileDown className="w-4 h-4 text-primary" />
              Exportar Inventario
            </a>

            {/* Import Excel button */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImport}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importando}
              className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border text-foreground rounded-xl font-medium hover:bg-muted transition-all shadow-md whitespace-nowrap text-sm disabled:opacity-60"
            >
              {importando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Importando...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 text-primary" /> Importar Excel
                </>
              )}
            </button>
                        <input
              ref={fileInputCompletoRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handlePrevisualizar}
            />
            <button
              onClick={() => fileInputCompletoRef.current?.click()}
              disabled={previsualizando}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 border border-primary/40 text-primary rounded-xl font-medium hover:bg-primary/20 transition-all shadow-md whitespace-nowrap text-sm disabled:opacity-60"
            >
              {previsualizando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Comparando...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" /> Importar y Revisar Cambios
                </>
              )}
            </button>
            <button
              onClick={() => setShowTrasladar(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border text-foreground rounded-xl font-medium hover:bg-muted transition-all shadow-md whitespace-nowrap text-sm"
            >
              <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
              Trasladar Stock
            </button>
            <button
              onClick={() => {
                setEditingId(null);
                setFormData({
                  nombre: "",
                  codigo: "",
                  marca: "",
                  tipo: "",
                  referencia: "",
                  adicional: "",
                  precioCompra: 0,
                  precioVentaSinIva: 0,
                  tieneIva: true,
                  stockActual: 0,
                  stockMinimo: 0,
                  stockLocal: 0,
                  stockBodega: 0,
                  activo: true,
                });
                setShowForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-lg hover:shadow-primary/25 whitespace-nowrap text-sm"
            >
              <Plus className="w-4 h-4" />
              Nuevo Producto
            </button>
          </div>
          <div className="flex gap-2 border-b border-border">
            <button
              onClick={() => setVista("productos")}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${vista === "productos" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              Productos
            </button>
            <button
              onClick={() => setVista("remachadas")}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${vista === "remachadas" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              Remachadas
            </button>
          </div>
        </div>
        
        {/* Vista previa de cambios */}
        {previewCompleto && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 90 }} onClick={() => setPreviewCompleto(null)}>
            <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
                <h2 className="text-lg font-bold text-foreground">Vista previa de cambios</h2>
                <button onClick={() => setPreviewCompleto(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none">✕</button>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-background rounded-xl border border-border p-3 text-center">
                    <p className="text-2xl font-bold text-foreground">{previewCompleto.totalEnArchivo}</p>
                    <p className="text-xs text-muted-foreground">En el Excel</p>
                  </div>
                  <div className="bg-emerald-500/10 rounded-xl border border-emerald-500/30 p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-400">{previewCompleto.cambios.filter((c) => c.esNuevo).length}</p>
                    <p className="text-xs text-muted-foreground">Productos nuevos</p>
                  </div>
                  <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-3 text-center">
                    <p className="text-2xl font-bold text-amber-400">{previewCompleto.cambios.filter((c) => !c.esNuevo).length}</p>
                    <p className="text-xs text-muted-foreground">Con cambios</p>
                  </div>
                  <div className="bg-background rounded-xl border border-border p-3 text-center">
                    <p className="text-2xl font-bold text-muted-foreground">{previewCompleto.sinCambios}</p>
                    <p className="text-xs text-muted-foreground">Sin cambios (se ignoran)</p>
                  </div>
                </div>

                {previewCompleto.omitidosSinNombre > 0 && (
                  <p className="text-sm text-destructive">⚠ {previewCompleto.omitidosSinNombre} fila(s) se omitieron por ser productos nuevos sin nombre.</p>
                )}

                {previewCompleto.cambios.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground text-sm">No hay ningún cambio que aplicar — el archivo coincide con lo que ya tienes.</p>
                ) : (
                  <div className="border border-border rounded-xl overflow-hidden max-h-[50vh] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2">Código</th>
                          <th className="text-left px-3 py-2">Producto</th>
                          <th className="text-left px-3 py-2">Cambios</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {previewCompleto.cambios.map((c) => (
                          <tr key={c.codigo}>
                            <td className="px-3 py-2 font-mono text-xs align-top">{c.codigo}</td>
                            <td className="px-3 py-2 align-top">
                              {c.nombre}
                              {c.esNuevo && <span className="ml-2 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">NUEVO</span>}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {c.esNuevo ? (
                                <span className="text-muted-foreground">Se creará este producto</span>
                              ) : (
                                <ul className="space-y-0.5">
                                  {c.cambios.map((d, i) => (
                                    <li key={i}>
                                      <span className="text-muted-foreground">{d.campo}:</span>{" "}
                                      <span className="text-destructive">{d.actual}</span>{" → "}
                                      <span className="text-emerald-400 font-medium">{d.nuevo}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {previewCompleto.cambios.length > 0 && (
                  <button
                    onClick={handleAplicarCompleto}
                    disabled={aplicandoCompleto}
                    className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-xl font-bold disabled:opacity-50"
                  >
                    {aplicandoCompleto ? "Aplicando..." : `Aplicar ${previewCompleto.cambios.length} cambio(s)`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {resultadoAplicado && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 90 }} onClick={() => setResultadoAplicado(null)}>
            <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center space-y-3" onClick={(e) => e.stopPropagation()}>
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h3 className="text-lg font-bold text-foreground">¡Listo!</h3>
              <p className="text-sm text-muted-foreground">
                {resultadoAplicado.actualizados} producto(s) actualizado(s), {resultadoAplicado.creados} creado(s) nuevo(s).
              </p>
              <button onClick={() => setResultadoAplicado(null)} className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium">
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* Trasladar Stock Modal */}
        <div className="space-y-4">
          {showTrasladar && (
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 90,
              }}
              onClick={() => setShowTrasladar(false)}
            >
              <div
                className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-cyan-400" />
                  {direccionTraslado === "local-bodega"
                    ? "Trasladar de Local a Bodega"
                    : "Trasladar de Bodega a Local"}
                </h3>
                <select value={direccionTraslado} onChange={(e) => setDireccionTraslado(e.target.value as any)}
                  className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm mb-3">
                  <option value="bodega-local">📦 Bodega → 🏪 Local</option>
                  <option value="local-bodega">🏪 Local → 📦 Bodega</option>
                </select>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Producto
                  </label>
                  <SearchableSelect
                    opciones={(productos || []).map(
                      (p): ProductoOpcion => ({
                        id: String(p.id),
                        nombre: p.nombre,
                        codigo: p.codigo,
                        marca: p.marca || undefined,
                        stockActual: (p as any).stockBodega,
                        stockMinimo: 0,
                      }),
                    )}
                    value={trasladarProductoId}
                    onChange={setTrasladarProductoId}
                    placeholder="Buscar producto..."
                  />
                </div>

                {productoTrasladar && (
                  <div className="bg-background rounded-xl border border-border p-3 flex justify-between text-sm">
                    <span>
                      🏪 Local:{" "}
                      <strong>
                        {(productoTrasladar as any).stockLocal ?? 0}
                      </strong>
                    </span>
                    <span>
                      📦 Bodega:{" "}
                      <strong>
                        {(productoTrasladar as any).stockBodega ?? 0}
                      </strong>
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Cantidad a trasladar
                  </label>
                  <input
                    type="number"
                    value={trasladarCantidad}
                    onChange={(e) => setTrasladarCantidad(e.target.value)}
                    className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleTrasladar}
                    disabled={
                      trasladando || !trasladarProductoId || !trasladarCantidad
                    }
                    className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm disabled:opacity-50"
                  >
                    {trasladando ? "Trasladando..." : "Confirmar traslado"}
                  </button>
                  <button
                    onClick={() => setShowTrasladar(false)}
                    className="px-4 py-2.5 bg-muted text-foreground rounded-xl font-medium border border-border text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Import result banner */}
          {importResult && (
            <div
              className={`rounded-2xl border px-5 py-4 flex items-start gap-3 shadow-lg ${
                importResult.ok
                  ? "bg-green-900/20 border-green-700/40 text-green-300"
                  : "bg-destructive/10 border-destructive/30 text-destructive"
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {importResult.ok ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <AlertCircle className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 text-sm">
                {importResult.ok ? (
                  <>
                    <p className="font-bold">
                      Importación completada
                      {resolvedOk && " · conflictos resueltos ✓"}
                    </p>
                    <p className="mt-0.5 opacity-80">
                      {importResult.procesados} productos importados
                      {importResult.omitidos > 0 &&
                        ` · ${importResult.omitidos} filas sin código/nombre omitidas`}
                      {(importResult.conflictos?.length ?? 0) > 0 &&
                        !resolvedOk &&
                        ` · ${importResult.conflictos!.length} con datos distintos — revisa abajo`}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-bold">Error en la importación</p>
                    <p className="mt-0.5 opacity-80">{importResult.error}</p>
                  </>
                )}
              </div>
              <button
                onClick={() => {
                  setImportResult(null);
                  setConflictos([]);
                  setResolvedOk(false);
                }}
                className="flex-shrink-0 text-current opacity-60 hover:opacity-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {productosNuevos.length > 0 && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-foreground">
                    {productosNuevos.length} producto
                    {productosNuevos.length === 1 ? " nuevo" : "s nuevos"}{" "}
                    detectado{productosNuevos.length === 1 ? "" : "s"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Estos códigos no existen en el inventario. Revisa la
                    información antes de crearlos.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setProductosNuevos([])}
                    disabled={confirmandoNuevos}
                    className="px-3 py-2 text-xs rounded-lg border border-border bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    No crear
                  </button>
                  <button
                    onClick={handleConfirmarNuevos}
                    disabled={confirmandoNuevos}
                    className="flex items-center gap-2 px-4 py-2 text-xs rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {confirmandoNuevos && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    Confirmar creación
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Código</th>
                      <th className="px-3 py-2 text-left">Nombre</th>
                      <th className="px-3 py-2 text-left">Marca</th>
                      <th className="px-3 py-2 text-right">Compra</th>
                      <th className="px-3 py-2 text-right">Venta</th>
                      <th className="px-3 py-2 text-right">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosNuevos.map((p) => (
                      <tr key={p.codigo} className="border-t border-border/60">
                        <td className="px-3 py-2 font-mono">{p.codigo}</td>
                        <td className="px-3 py-2">{p.nombre}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {p.marca || "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {fmtP(p.precioCompra)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {fmtP(p.precioVentaSinIva)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {p.cantidad ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {conflictosCantidad.length > 0 && !cantidadResueltaOk && (
            <div className="bg-card border border-amber-500/40 rounded-2xl p-5 shadow-xl space-y-4">
              <div>
                <h3 className="font-bold text-foreground flex items-center gap-2">
                  ⚠️ {conflictosCantidad.length} producto
                  {conflictosCantidad.length !== 1 ? "s" : ""} ya tienen
                  existencias
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Estos productos ya tenían unidades en el inventario, y la
                  plantilla también trae una cantidad para ellos. ¿Qué quieres
                  hacer?
                </p>
              </div>

              <div className="max-h-48 overflow-y-auto border border-border rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">Producto</th>
                      <th className="text-right px-3 py-2">Ya tiene</th>
                      <th className="text-right px-3 py-2">Plantilla trae</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {conflictosCantidad.map((c) => (
                      <tr key={c.codigo}>
                        <td className="px-3 py-1.5">{c.nombre}</td>
                        <td className="px-3 py-1.5 text-right">
                          {c.stockActual}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {c.cantidadArchivo}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2">
                <button
                  disabled={resolviendoCantidad}
                  onClick={() => handleResolverCantidad("sumar")}
                  className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm disabled:opacity-50"
                >
                  Sumar a lo que ya hay
                </button>
                <button
                  disabled={resolviendoCantidad}
                  onClick={() => handleResolverCantidad("reemplazar")}
                  className="flex-1 px-4 py-2.5 bg-muted text-foreground rounded-xl font-medium text-sm border border-border disabled:opacity-50"
                >
                  Reemplazar por el valor de la plantilla
                </button>
              </div>
            </div>
          )}

          {/* ── Conflict resolution panel ── */}
          {conflictos.length > 0 && !resolvedOk && (
            <div className="bg-card border border-amber-500/30 rounded-2xl shadow-lg overflow-hidden">
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-amber-500/10 border-b border-amber-500/20">
                <div className="flex items-center gap-2">
                  <GitMerge className="w-5 h-5 text-amber-400" />
                  <div>
                    <p className="font-bold text-foreground text-sm">
                      {conflictos.length} código
                      {conflictos.length !== 1 ? "s" : ""} con información
                      diferente
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="text-primary font-medium">A</span> = ya
                      importada (primera aparición) ·{" "}
                      <span className="text-amber-400 font-medium">B</span> =
                      reemplazar con segunda aparición ·{" "}
                      <span className="text-emerald-400 font-medium">
                        Nuevo
                      </span>{" "}
                      = crear segunda como producto separado con otro código
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() =>
                      setChoices((prev) => {
                        const n = { ...prev };
                        conflictos.forEach((c) => {
                          n[c.codigo] = "A";
                        });
                        return n;
                      })
                    }
                    className="px-3 py-1.5 text-xs bg-muted border border-border rounded-lg hover:bg-muted/80 transition-colors"
                  >
                    Todas → A
                  </button>
                  <button
                    onClick={() =>
                      setChoices((prev) => {
                        const n = { ...prev };
                        conflictos.forEach((c) => {
                          n[c.codigo] = "B";
                        });
                        return n;
                      })
                    }
                    className="px-3 py-1.5 text-xs bg-muted border border-border rounded-lg hover:bg-muted/80 transition-colors"
                  >
                    Todas → B
                  </button>
                  <button
                    onClick={handleResolver}
                    disabled={resolviendo}
                    className="flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
                  >
                    {resolviendo ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                        Aplicando...
                      </>
                    ) : (
                      "Aplicar selecciones"
                    )}
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                    <tr className="text-muted-foreground uppercase tracking-wider text-[10px]">
                      <th className="px-4 py-2 text-left font-medium w-28">
                        Código
                      </th>
                      <th className="px-3 py-2 text-center font-medium w-10"></th>
                      <th className="px-3 py-2 text-left font-medium">
                        Nombre
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Referencia
                      </th>
                      <th className="px-3 py-2 text-left font-medium">Marca</th>
                      <th className="px-3 py-2 text-right font-medium">
                        P. Compra
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        P. Venta s/IVA
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {conflictos.map((c) => {
                      const sel = choices[c.codigo];
                      const nc = newCodes[c.codigo] ?? "";
                      const ncInvalid =
                        sel === "C" &&
                        (nc.trim() === "" || nc.trim() === c.codigo);
                      return (
                        <React.Fragment key={c.codigo}>
                          {/* ── Row A: first occurrence (already imported) ── */}
                          <tr
                            onClick={() =>
                              setChoices((p) => ({ ...p, [c.codigo]: "A" }))
                            }
                            className={`cursor-pointer border-t border-border/50 transition-colors ${
                              sel === "A"
                                ? "bg-primary/10"
                                : "hover:bg-muted/30"
                            }`}
                          >
                            <td
                              className="px-4 py-2 font-mono text-muted-foreground align-middle"
                              rowSpan={3}
                            >
                              {c.codigo}
                            </td>
                            <td className="px-3 py-2 text-center align-middle">
                              <div
                                className={`w-4 h-4 rounded-full border-2 mx-auto flex items-center justify-center ${
                                  sel === "A"
                                    ? "border-primary bg-primary"
                                    : "border-muted-foreground/50"
                                }`}
                              >
                                {sel === "A" && (
                                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 font-medium" colSpan={5}>
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/15 px-1.5 py-0.5 rounded">
                                  A
                                </span>
                                <span>{c.opcionA.nombre}</span>
                                {c.opcionA.referencia && (
                                  <span className="text-muted-foreground">
                                    {c.opcionA.referencia}
                                  </span>
                                )}
                                {c.opcionA.marca && (
                                  <span className="text-muted-foreground">
                                    · {c.opcionA.marca}
                                  </span>
                                )}
                                <span className="ml-auto text-muted-foreground">
                                  {fmtP(c.opcionA.precioCompra)} /{" "}
                                  {fmtP(c.opcionA.precioVentaSinIva)}
                                </span>
                              </div>
                            </td>
                          </tr>

                          {/* ── Row B: second occurrence (replace) ── */}
                          <tr
                            onClick={() =>
                              setChoices((p) => ({ ...p, [c.codigo]: "B" }))
                            }
                            className={`cursor-pointer transition-colors ${
                              sel === "B"
                                ? "bg-amber-500/10"
                                : "hover:bg-muted/30"
                            }`}
                          >
                            <td className="px-3 py-2 text-center align-middle">
                              <div
                                className={`w-4 h-4 rounded-full border-2 mx-auto flex items-center justify-center ${
                                  sel === "B"
                                    ? "border-amber-400 bg-amber-400"
                                    : "border-muted-foreground/50"
                                }`}
                              >
                                {sel === "B" && (
                                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2" colSpan={5}>
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-400/15 px-1.5 py-0.5 rounded">
                                  B
                                </span>
                                <span className="font-medium">
                                  {c.opcionB.nombre}
                                </span>
                                {c.opcionB.referencia && (
                                  <span className="text-muted-foreground">
                                    {c.opcionB.referencia}
                                  </span>
                                )}
                                {c.opcionB.marca && (
                                  <span className="text-muted-foreground">
                                    · {c.opcionB.marca}
                                  </span>
                                )}
                                <span className="ml-auto text-muted-foreground">
                                  {fmtP(c.opcionB.precioCompra)} /{" "}
                                  {fmtP(c.opcionB.precioVentaSinIva)}
                                </span>
                              </div>
                            </td>
                          </tr>

                          {/* ── Row C: create new with different code ── */}
                          <tr
                            className={`border-b border-border transition-colors ${
                              sel === "C"
                                ? "bg-emerald-500/10"
                                : "hover:bg-muted/30"
                            }`}
                          >
                            <td
                              className="px-3 py-2 text-center align-middle cursor-pointer"
                              onClick={() =>
                                setChoices((p) => ({ ...p, [c.codigo]: "C" }))
                              }
                            >
                              <div
                                className={`w-4 h-4 rounded-full border-2 mx-auto flex items-center justify-center ${
                                  sel === "C"
                                    ? "border-emerald-400 bg-emerald-400"
                                    : "border-muted-foreground/50"
                                }`}
                              >
                                {sel === "C" && (
                                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2" colSpan={5}>
                              <div className="flex items-center gap-3 flex-wrap">
                                <span
                                  className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-400/15 px-1.5 py-0.5 rounded cursor-pointer"
                                  onClick={() =>
                                    setChoices((p) => ({
                                      ...p,
                                      [c.codigo]: "C",
                                    }))
                                  }
                                >
                                  Nuevo
                                </span>
                                <span className="text-muted-foreground text-[11px]">
                                  Crear{" "}
                                  <span className="font-medium text-foreground">
                                    {c.opcionB.nombre}
                                  </span>{" "}
                                  como producto separado con código:
                                </span>
                                <input
                                  type="text"
                                  placeholder="Escribe el nuevo código…"
                                  value={nc}
                                  onFocus={() =>
                                    setChoices((p) => ({
                                      ...p,
                                      [c.codigo]: "C",
                                    }))
                                  }
                                  onChange={(e) =>
                                    setNewCodes((p) => ({
                                      ...p,
                                      [c.codigo]: e.target.value,
                                    }))
                                  }
                                  className={`flex-1 min-w-[160px] max-w-[280px] px-3 py-1 rounded-lg border text-xs font-mono bg-background focus:outline-none focus:ring-2 transition-colors ${
                                    sel === "C" && ncInvalid
                                      ? "border-destructive focus:ring-destructive/40 text-destructive"
                                      : sel === "C"
                                        ? "border-emerald-500 focus:ring-emerald-500/40"
                                        : "border-border focus:ring-primary/40"
                                  }`}
                                />
                                {sel === "C" && ncInvalid && (
                                  <span className="text-destructive text-[11px]">
                                    {nc.trim() === ""
                                      ? "Obligatorio"
                                      : "Debe ser diferente al código original"}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer summary */}
              <div className="px-5 py-3 border-t border-border bg-muted/30 flex items-center justify-between gap-4 text-xs text-muted-foreground flex-wrap">
                <span className="flex gap-3">
                  <span>
                    {conflictos.filter((c) => choices[c.codigo] === "A").length}{" "}
                    mantienen A
                  </span>
                  <span>·</span>
                  <span>
                    {conflictos.filter((c) => choices[c.codigo] === "B").length}{" "}
                    reemplazan con B
                  </span>
                  <span>·</span>
                  <span>
                    {conflictos.filter((c) => choices[c.codigo] === "C").length}{" "}
                    crean producto nuevo
                  </span>
                </span>
                <button
                  onClick={handleResolver}
                  disabled={resolviendo}
                  className="flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {resolviendo ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                      Aplicando...
                    </>
                  ) : (
                    "Aplicar selecciones"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Search + Filter bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por código, nombre, marca, tipo o referencia..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl focus:ring-2 focus:ring-primary focus:outline-none text-sm"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all whitespace-nowrap ${
                activeFilterCount > 0
                  ? "bg-primary/10 border-primary text-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Filter className="w-4 h-4" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
              <ChevDown
                className={`w-4 h-4 transition-transform ${showFilters ? "rotate-180" : ""}`}
              />
            </button>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-card border border-border px-3 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none whitespace-nowrap"
              title="Productos por página"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s} por pág.
                </option>
              ))}
            </select>
          </div>

          {vista === "productos" && (
            <>
              {/* Filter Panel */}
              {showFilters && (
                <div className="bg-card border border-border rounded-2xl p-4 shadow-lg animate-in fade-in slide-in-from-top-2">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-foreground">
                      Filtros de Inventario
                    </h3>
                    {activeFilterCount > 0 && (
                      <button
                        onClick={clearFilters}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="w-3 h-3" />
                        Limpiar filtros
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Marca filter */}
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Marca
                      </label>
                      <input
                        type="text"
                        placeholder="Buscar marca..."
                        value={filters.marcaBusqueda}
                        onChange={(e) =>
                          setFilters((f) => ({
                            ...f,
                            marcaBusqueda: e.target.value,
                          }))
                        }
                        className="w-full bg-background border border-border px-3 py-1.5 rounded-lg text-xs mb-2 focus:ring-1 focus:ring-primary outline-none"
                      />
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {filteredMarcas.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">
                            Sin marcas disponibles
                          </p>
                        ) : (
                          filteredMarcas.map((m) => (
                            <label
                              key={m}
                              className="flex items-center gap-2 cursor-pointer group"
                            >
                              <input
                                type="checkbox"
                                checked={filters.marcas.includes(m)}
                                onChange={() => toggleMarca(m)}
                                className="w-4 h-4 rounded accent-primary"
                              />
                              <span
                                className={`text-xs transition-colors ${filters.marcas.includes(m) ? "text-primary font-medium" : "text-foreground group-hover:text-primary"}`}
                              >
                                {m}
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Tipo filter */}
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Tipo
                      </label>
                      <input
                        type="text"
                        placeholder="Buscar tipo..."
                        value={filters.tipoBusqueda}
                        onChange={(e) =>
                          setFilters((f) => ({
                            ...f,
                            tipoBusqueda: e.target.value,
                          }))
                        }
                        className="w-full bg-background border border-border px-3 py-1.5 rounded-lg text-xs mb-2 focus:ring-1 focus:ring-primary outline-none"
                      />
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {filteredTipos.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">
                            Sin tipos disponibles
                          </p>
                        ) : (
                          filteredTipos.map((t) => (
                            <label
                              key={t}
                              className="flex items-center gap-2 cursor-pointer group"
                            >
                              <input
                                type="checkbox"
                                checked={filters.tipos.includes(t)}
                                onChange={() => toggleTipo(t)}
                                className="w-4 h-4 rounded accent-primary"
                              />
                              <span
                                className={`text-xs transition-colors ${filters.tipos.includes(t) ? "text-primary font-medium" : "text-foreground group-hover:text-primary"}`}
                              >
                                {t}
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Estado de stock
                      </label>
                      <div className="space-y-1">
                        {[
                          { value: "todos", label: "Todos" },
                          { value: "activos", label: "🟢 Activos" },
                          { value: "inactivos", label: "⚫ Inactivos" },
                          { value: "bajo", label: "⚠ Poco stock" },
                          { value: "sin", label: "🔴 Sin existencias" },
                        ].map((opt) => (
                          <label
                            key={opt.value}
                            className="flex items-center gap-2 cursor-pointer group"
                          >
                            <input
                              type="radio"
                              name="estadoStock"
                              checked={filters.estadoStock === opt.value}
                              onChange={() =>
                                setFilters((f) => ({
                                  ...f,
                                  estadoStock: opt.value as any,
                                }))
                              }
                              className="w-4 h-4 accent-primary"
                            />
                            <span
                              className={`text-xs transition-colors ${filters.estadoStock === opt.value ? "text-primary font-medium" : "text-foreground group-hover:text-primary"}`}
                            >
                              {opt.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Active filter chips */}
              {activeFilterCount > 0 && (
                <div className="flex flex-wrap gap-2">
                  {filters.marcas.map((m) => (
                    <span
                      key={m}
                      className="flex items-center gap-1 bg-primary/10 border border-primary/30 text-primary text-xs px-2 py-1 rounded-full"
                    >
                      Marca: {m}
                      <button
                        onClick={() => toggleMarca(m)}
                        className="hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {filters.tipos.map((t) => (
                    <span
                      key={t}
                      className="flex items-center gap-1 bg-primary/10 border border-primary/30 text-primary text-xs px-2 py-1 rounded-full"
                    >
                      Tipo: {t}
                      <button
                        onClick={() => toggleTipo(t)}
                        className="hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Table */}
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl shadow-black/10">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs lg:text-sm">
                    <thead>
                      <tr className="bg-muted text-muted-foreground border-b border-border">
                        <th
                          className={thClass}
                          onClick={() => handleSort("codigo")}
                        >
                          <span className="flex items-center gap-1">
                            Código{" "}
                            <SortIcon
                              col="codigo"
                              sortCol={sortCol}
                              sortDir={sortDir}
                            />
                          </span>
                        </th>
                        <th
                          className={thClass}
                          onClick={() => handleSort("nombre")}
                        >
                          <span className="flex items-center gap-1">
                            Producto{" "}
                            <SortIcon
                              col="nombre"
                              sortCol={sortCol}
                              sortDir={sortDir}
                            />
                          </span>
                        </th>
                        <th
                          className={thClass}
                          onClick={() => handleSort("marca")}
                        >
                          <span className="flex items-center gap-1">
                            Marca{" "}
                            <SortIcon
                              col="marca"
                              sortCol={sortCol}
                              sortDir={sortDir}
                            />
                          </span>
                        </th>
                        <th
                          className={thClass}
                          onClick={() => handleSort("stockActual")}
                        >
                          <span className="flex items-center gap-1">
                            Stock{" "}
                            <SortIcon
                              col="stockActual"
                              sortCol={sortCol}
                              sortDir={sortDir}
                            />
                          </span>
                        </th>
                        <th
                          className={thClass}
                          onClick={() => handleSort("tipo")}
                        >
                          <span className="flex items-center gap-1">
                            Tipo{" "}
                            <SortIcon
                              col="tipo"
                              sortCol={sortCol}
                              sortDir={sortDir}
                            />
                          </span>
                        </th>
                        <th className="px-3 py-3 font-medium whitespace-nowrap text-xs lg:text-sm">
                          Referencia
                        </th>
                        <th
                          className={thClass}
                          onClick={() => handleSort("precioCompra")}
                        >
                          <span className="flex items-center gap-1">
                            P. Compra{" "}
                            <SortIcon
                              col="precioCompra"
                              sortCol={sortCol}
                              sortDir={sortDir}
                            />
                          </span>
                        </th>
                        <th className="px-3 py-3 font-medium whitespace-nowrap text-xs lg:text-sm">
                          P. Venta s/IVA
                        </th>
                        <th
                          className={`${thClass} text-primary`}
                          onClick={() => handleSort("precioVentaConIva")}
                        >
                          <span className="flex items-center gap-1">
                            P. Venta c/IVA{" "}
                            <SortIcon
                              col="precioVentaConIva"
                              sortCol={sortCol}
                              sortDir={sortDir}
                            />
                          </span>
                        </th>
                        <th className="px-3 py-3 font-medium text-right text-xs lg:text-sm">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {isLoading ? (
                        <tr>
                          <td
                            colSpan={10}
                            className="px-6 py-8 text-center text-muted-foreground"
                          >
                            Cargando inventario...
                          </td>
                        </tr>
                      ) : filteredProductos.length === 0 ? (
                        <tr>
                          <td
                            colSpan={10}
                            className="px-6 py-8 text-center text-muted-foreground"
                          >
                            No se encontraron productos.
                          </td>
                        </tr>
                      ) : (
                        paginatedProductos.map((prod) => (
                          <tr
                            key={prod.id}
                            className="hover:bg-muted/50 transition-colors group"
                          >
                            <td className="px-3 py-3 text-foreground font-mono text-xs">
                              {prod.codigo}
                            </td>
                            <td className="px-3 py-3 text-foreground font-medium max-w-[180px] truncate">
                              {prod.nombre}
                            </td>
                            <td className="px-3 py-3 text-muted-foreground">
                              {prod.marca || "—"}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={
                                    prod.stockActual <= prod.stockMinimo
                                      ? "text-destructive font-bold"
                                      : "text-foreground"
                                  }
                                >
                                  {typeof prod.stockActual === "number"
                                    ? prod.stockActual.toLocaleString("es-CO", {
                                        maximumFractionDigits: 2,
                                      })
                                    : prod.stockActual}
                                </span>
                                {prod.stockActual <= prod.stockMinimo && (
                                  <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                                <span title="En el local">
                                  🏪 {(prod as any).stockLocal ?? 0}
                                </span>
                                <span title="En bodega">
                                  📦 {(prod as any).stockBodega ?? 0}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-muted-foreground">
                              {(prod as any).tipo || "—"}
                              {(prod as any).activo === false && (
                                <span className="ml-2 rounded-full bg-slate-500/15 px-1.5 py-0.5 text-[10px] text-slate-400">
                                  Inactivo
                                </span>
                              )}
                            </td>
                            <td
                              className="px-3 py-3 text-muted-foreground text-xs max-w-[120px] truncate"
                              title={prod.referencia || ""}
                            >
                              {prod.referencia || "—"}
                            </td>
                            <td className="px-3 py-3 text-muted-foreground">
                              {formatCurrency(prod.precioCompra)}
                            </td>
                            <td className="px-3 py-3 text-muted-foreground">
                              {formatCurrency(prod.precioVentaSinIva)}
                            </td>
                            <td className="px-3 py-3 text-primary font-bold">
                              {formatCurrency(prod.precioVentaConIva)}
                            </td>
                            <td className="px-3 py-3 text-right">
                              {(prod as any)._pendiente ? (
                                <span
                                  className="text-[10px] text-amber-400 font-medium whitespace-nowrap"
                                  title="Guardado local, esperando sincronizar"
                                >
                                  ⏳ Pendiente
                                </span>
                              ) : (
                                <div className="flex justify-end items-center gap-1.5">
                                  <select
                                    value={(prod as any).activo === false ? "inactivo" : "activo"}
                                    onChange={(e) => e.target.value === "inactivo" ? handleDelete(prod.id) : handleReactivar(prod.id)}
                                    className={`text-xs px-2 py-1 rounded-lg border outline-none cursor-pointer ${
                                      (prod as any).activo === false
                                        ? "bg-destructive/10 border-destructive/30 text-destructive"
                                        : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                    }`}
                                  >
                                    <option value="activo">🟢 Activo</option>
                                    <option value="inactivo">🔴 Inactivo</option>
                                  </select>
                                  <button
                                    onClick={() => openEdit(prod)}
                                    className="p-1.5 text-muted-foreground hover:text-primary bg-muted rounded-lg transition-colors opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {filteredProductos.length > 0 && (
                      <tfoot className="bg-muted/30 border-t border-border">
                        <tr>
                          <td
                            colSpan={8}
                            className="px-3 py-2 text-xs text-muted-foreground text-right"
                          >
                            Mostrando {(currentPage - 1) * pageSize + 1}–
                            {Math.min(
                              currentPage * pageSize,
                              filteredProductos.length,
                            )}{" "}
                            de {filteredProductos.length} producto
                            {filteredProductos.length !== 1 ? "s" : ""}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* Pagination controls */}
              {filteredProductos.length > pageSize && (
                <div className="flex items-center justify-center gap-3 py-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                  >
                    ← Anterior
                  </button>
                  <span className="text-sm text-muted-foreground">
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                  >
                    Siguiente →
                  </button>
                </div>
              )}

              {/* Form Dialog */}
              {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                  <div className="bg-card w-full max-w-2xl rounded-2xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                    <div className="px-6 py-4 border-b border-border bg-muted/50 flex justify-between items-center sticky top-0">
                      <h3 className="text-xl font-display font-bold text-foreground">
                        {editingId ? "Editar Producto" : "Nuevo Producto"}
                      </h3>
                      <button
                        onClick={() => setShowForm(false)}
                        className="text-muted-foreground hover:text-foreground text-xl leading-none"
                      >
                        ✕
                      </button>
                    </div>
                    <form onSubmit={handleSave} className="p-6 space-y-5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-1">
                            Código
                          </label>
                          <input
                            required
                            type="text"
                            value={formData.codigo}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                codigo: e.target.value,
                              })
                            }
                            className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-1">
                            Nombre
                          </label>
                          <input
                            required
                            type="text"
                            value={formData.nombre}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                nombre: e.target.value,
                              })
                            }
                            className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-1">
                            Marca
                          </label>
                          <input
                            type="text"
                            value={formData.marca}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                marca: e.target.value,
                              })
                            }
                            className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-1">
                            Tipo
                          </label>
                          <input
                            type="text"
                            placeholder="Ej: Filtro, Aceite, Frenos..."
                            value={formData.tipo}
                            onChange={(e) =>
                              setFormData({ ...formData, tipo: e.target.value })
                            }
                            className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-1">
                            Referencia
                          </label>
                          <input
                            type="text"
                            value={formData.referencia}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                referencia: e.target.value,
                              })
                            }
                            className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">
                          Adicional / Observaciones
                        </label>
                        <textarea
                          rows={3}
                          placeholder="Información adicional, notas, compatibilidad, etc."
                          value={formData.adicional}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              adicional: e.target.value,
                            })
                          }
                          className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground resize-none text-sm"
                        />
                      </div>

                      <hr className="border-border" />

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-1">
                            🏪 En Local
                          </label>
                          <input
                            required
                            type="number"
                            step="0.01"
                            value={formData.stockLocal}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                stockLocal: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-1">
                            📦 En Bodega
                          </label>
                          <input
                            required
                            type="number"
                            step="0.01"
                            value={formData.stockBodega}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                stockBodega: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-1">
                            Total (automático)
                          </label>
                          <div className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground font-bold">
                            {(formData.stockLocal + formData.stockBodega).toLocaleString("es-CO", { maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-1">
                            Stock Mínimo (Alerta)
                          </label>
                          <input
                            required
                            type="number"
                            step="0.01"
                            value={formData.stockMinimo}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                stockMinimo: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground"
                          />
                        </div>
                      </div>

                      <hr className="border-border" />

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-1">
                            Precio Compra ($)
                          </label>
                          <input
                            required
                            type="number"
                            value={formData.precioCompra}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                precioCompra: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-1 flex items-center justify-between">
                            <span>Precio Venta Sin IVA ($)</span>
                            <span
                              className={
                                margen < 20
                                  ? "text-destructive text-xs"
                                  : "text-green-500 text-xs"
                              }
                            >
                              Margen: {margen.toFixed(1)}%
                            </span>
                          </label>
                          <input
                            required
                            type="number"
                            value={formData.precioVentaSinIva}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                precioVentaSinIva:
                                  parseFloat(e.target.value) || 0,
                              })
                            }
                            className={`w-full px-4 py-2 bg-background border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground ${formData.precioCompra > 0 && formData.precioVentaSinIva < formData.precioCompra ? "border-destructive" : "border-border"}`}
                          />
                          {formData.precioCompra > 0 &&
                            formData.precioVentaSinIva <
                              formData.precioCompra && (
                              <p className="text-destructive text-xs mt-1">
                                ⚠ Menor al costo
                              </p>
                            )}
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-muted/30 p-4 rounded-xl border border-border">
                        <label className="flex items-center gap-2 text-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.tieneIva}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                tieneIva: e.target.checked,
                              })
                            }
                            className="w-5 h-5 rounded border-border text-primary focus:ring-primary bg-background"
                          />
                          Aplica IVA (19%)
                        </label>
                        <div className="flex-1 text-right">
                          <span className="text-sm text-muted-foreground mr-2">
                            Precio Final Público:
                          </span>
                          <span className="text-2xl font-bold text-primary">
                            {formatCurrency(precioConIva)}
                          </span>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Estado</label>
                        <select
                          value={formData.activo ? "activo" : "inactivo"}
                          onChange={(e) => setFormData({ ...formData, activo: e.target.value === "activo" })}
                          className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-foreground"
                        >
                          <option value="activo">🟢 Activo</option>
                          <option value="inactivo">🔴 Inactivo</option>
                        </select>
                      </div>

                      <div className="flex justify-end gap-3 pt-4">
                        <button
                          type="button"
                          onClick={() => setShowForm(false)}
                          className="px-6 py-2 rounded-xl text-foreground bg-muted hover:bg-muted/80 transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={
                            crearMutation.isPending ||
                            actualizarMutation.isPending ||
                            (formData.precioCompra > 0 &&
                              formData.precioVentaSinIva <
                                formData.precioCompra)
                          }
                          className="px-6 py-2 rounded-xl text-primary-foreground bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Guardar Producto
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </>
          )}
          {vista === "remachadas" && <RemachadasPanel />}
        </div>
      </div>
    </Layout>
  );
}
