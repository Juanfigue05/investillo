import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { Search, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  crearRegistrosBusquedaGlobal,
  filtrarBusquedaGlobal,
  type RegistroBusquedaGlobal,
} from "@/lib/busqueda-global";

type DatosRegistros = {
  creditos: unknown[];
  clientes: unknown[];
  trabajadores: unknown[];
};

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");

async function obtenerLista(endpoint: string): Promise<unknown[]> {
  const response = await fetch(`${API}${endpoint}`);
  if (!response.ok) {
    throw new Error(`No se pudo consultar ${endpoint} (HTTP ${response.status}).`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new Error(`La respuesta de ${endpoint} no tiene el formato esperado.`);
  }
  return data;
}

export function GlobalSearchDialog() {
  const [, setLocation] = useLocation();
  const datosRef = useRef<DatosRegistros | null>(null);
  const [open, setOpen] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState<RegistroBusquedaGlobal[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [busquedaRealizada, setBusquedaRealizada] = useState(false);

  const buscar = async (actualizar = false) => {
    const termino = consulta.trim();
    if (termino.length < 2) {
      setError("Escribe al menos 2 caracteres para buscar.");
      setResultados([]);
      setBusquedaRealizada(false);
      return;
    }

    setCargando(true);
    setError("");
    try {
      if (actualizar || !datosRef.current) {
        const [creditos, clientes, trabajadores] = await Promise.all([
          obtenerLista("/creditos"),
          obtenerLista("/clientes"),
          obtenerLista("/trabajadores"),
        ]);
        datosRef.current = { creditos, clientes, trabajadores };
      }
      const registros = crearRegistrosBusquedaGlobal(datosRef.current);
      setResultados(filtrarBusquedaGlobal(registros, termino));
      setBusquedaRealizada(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setResultados([]);
      setBusquedaRealizada(false);
    } finally {
      setCargando(false);
    }
  };

  const cerrar = () => {
    setOpen(false);
    setConsulta("");
    setResultados([]);
    setError("");
    setBusquedaRealizada(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Búsqueda global"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Search className="h-4 w-4" />
      </button>
      <Dialog open={open} onOpenChange={(value) => !value && cerrar()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Búsqueda global</DialogTitle>
            <DialogDescription>
              Busca una factura, placa, cliente o trabajador y revisa sus registros relacionados.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void buscar();
            }}
            className="flex gap-2"
          >
            <input
              autoFocus
              type="search"
              value={consulta}
              onChange={(event) => setConsulta(event.target.value)}
              placeholder="Factura, placa, cliente o trabajador..."
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={cargando}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {cargando ? "Buscando..." : "Buscar"}
            </button>
            {datosRef.current && (
              <button
                type="button"
                onClick={() => void buscar(true)}
                disabled={cargando}
                aria-label="Actualizar registros de búsqueda"
                title="Actualizar registros"
                className="rounded-xl border border-border px-3 text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
          </form>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {busquedaRealizada && resultados.length === 0 && (
            <p className="text-sm text-muted-foreground">No se encontraron registros relacionados.</p>
          )}
          {resultados.length > 0 && (
            <div className="max-h-[55vh] space-y-2 overflow-y-auto">
              {resultados.map((resultado) => (
                <button
                  type="button"
                  key={resultado.id}
                  onClick={() => {
                    cerrar();
                    setLocation(resultado.ruta);
                  }}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-left hover:bg-muted"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">{resultado.categoria}</span>
                  <span className="mt-0.5 block text-sm font-medium text-foreground">{resultado.titulo}</span>
                  {resultado.detalle && <span className="mt-0.5 block text-xs text-muted-foreground">{resultado.detalle}</span>}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
