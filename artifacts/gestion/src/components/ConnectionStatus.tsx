import { useEffect, useState } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { contarNoSincronizadas, listarErrores } from "@/lib/offline-db";
import { describirEstadoSincronizacion } from "@/lib/estado-visual-sincronizacion";

export function ConnectionStatus({ compact = false }: { compact?: boolean }) {
  const online = useOnlineStatus();
  const [pendientes, setPendientes] = useState(0);
  const [errores, setErrores] = useState(0);

  useEffect(() => {
    let activo = true;
    const actualizar = async () => {
      try {
        const [cantidad, operacionesConError] = await Promise.all([
          contarNoSincronizadas(),
          listarErrores(),
        ]);
        if (!activo) return;
        setPendientes(cantidad);
        setErrores(operacionesConError.length);
      } catch (error) {
        console.error("No se pudo consultar el estado de sincronización.", error);
      }
    };

    void actualizar();
    window.addEventListener("online", actualizar);
    window.addEventListener("offline", actualizar);
    window.addEventListener("investillo:operacion-encolada", actualizar);
    window.addEventListener("investillo:sincronizacion-actualizada", actualizar);
    return () => {
      activo = false;
      window.removeEventListener("online", actualizar);
      window.removeEventListener("offline", actualizar);
      window.removeEventListener("investillo:operacion-encolada", actualizar);
      window.removeEventListener("investillo:sincronizacion-actualizada", actualizar);
    };
  }, []);

  const { label, tono } = describirEstadoSincronizacion(online, pendientes, errores);
  const className = tono === "error"
    ? "bg-destructive/10 text-destructive"
    : tono === "pendiente"
      ? "bg-amber-500/10 text-amber-400"
      : "bg-emerald-500/10 text-emerald-400";

  return (
    <div
      role="status"
      aria-label={label}
      title={label}
      className={`${compact ? "flex min-h-6 min-w-6 justify-center px-1" : "hidden sm:flex px-2.5 py-1"} items-center gap-1.5 rounded-full text-[11px] font-medium ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${tono === "error" ? "bg-destructive" : tono === "pendiente" ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
      {compact ? pendientes > 0 ? pendientes : null : label}
    </div>
  );
}