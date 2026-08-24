import { useState, useRef, useEffect } from "react";
import { HardDrive, Download, Upload, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { contarPendientes, exportarRespaldoLocal, importarRespaldoLocal } from "@/lib/offline-db";

export function BackupLocal({ topbar }: { topbar?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendientes, setPendientes] = useState(0);
  const [procesando, setProcesando] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) contarPendientes().then(setPendientes);
  }, [isOpen]);

  const handleGuardarLocal = async () => {
    setProcesando(true);
    try {
      const { blob, nombreArchivo } = await exportarRespaldoLocal();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreArchivo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Copia guardada localmente", description: `Se descargó ${nombreArchivo}.` });
    } catch (err) {
      toast({ title: "No se pudo guardar la copia local", description: String(err), variant: "destructive" });
    } finally {
      setProcesando(false);
    }
  };

  const handleImportarClick = () => fileInputRef.current?.click();

  const handleArchivoSeleccionado = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setProcesando(true);
    try {
      const resultado = await importarRespaldoLocal(archivo);
      if (resultado.ok) {
        toast({ title: "Importación exitosa", description: resultado.mensaje });
        setPendientes(await contarPendientes());
      } else {
        toast({ title: "No se importó el archivo", description: resultado.mensaje, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error al importar", description: String(err), variant: "destructive" });
    } finally {
      setProcesando(false);
    }
  };

  if (!topbar) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Copia local de respaldo"
        onClick={() => setIsOpen((o) => !o)}
        className="relative p-2 rounded-full hover:bg-muted transition-colors cursor-pointer block"
      >
        <HardDrive className="w-5 h-5 lg:w-6 lg:h-6 text-muted-foreground hover:text-foreground transition-colors" />
        {pendientes > 0 && (
          <span className="absolute top-0.5 right-0.5 w-4 h-4 lg:w-5 lg:h-5 bg-amber-500 text-white text-[9px] lg:text-[10px] font-bold rounded-full flex items-center justify-center">
            {pendientes > 99 ? "99+" : pendientes}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden z-50">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="font-semibold text-foreground text-sm">Copia local</p>
              <p className="text-xs text-muted-foreground">
                {pendientes > 0 ? `${pendientes} pendiente${pendientes === 1 ? "" : "s"} por sincronizar` : "Todo está sincronizado"}
              </p>
            </div>
            <button type="button" aria-label="Cerrar" onClick={() => setIsOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-3 space-y-2">
            <button type="button" disabled={procesando} onClick={handleGuardarLocal} className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted text-foreground rounded-xl font-medium hover:bg-muted/80 transition-all text-sm disabled:opacity-50">
              <Download className="w-4 h-4" /> Guardar copia local
            </button>
            <button type="button" disabled={procesando} onClick={handleImportarClick} className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted text-foreground rounded-xl font-medium hover:bg-muted/80 transition-all text-sm disabled:opacity-50">
              <Upload className="w-4 h-4" /> Importar copia local
            </button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleArchivoSeleccionado} className="hidden" />
          </div>
        </div>
      )}
    </div>
  );
}