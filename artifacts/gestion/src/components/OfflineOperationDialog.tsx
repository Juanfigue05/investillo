import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type OfflineNotice = { kind: "queued" } | { kind: "failed"; reason: string };

export function OfflineOperationDialog() {
  const [notice, setNotice] = useState<OfflineNotice | null>(null);

  useEffect(() => {
    const handleQueued = () => {
      setNotice({ kind: "queued" });
    };
    const handleNotSaved = (event: Event) => {
      const { reason } = (
        event as CustomEvent<{ endpoint: string; reason: string }>
      ).detail;
      setNotice({ kind: "failed", reason });
    };

    window.addEventListener("investillo:operacion-encolada", handleQueued);
    window.addEventListener("investillo:operacion-no-guardada", handleNotSaved);
    return () => {
      window.removeEventListener("investillo:operacion-encolada", handleQueued);
      window.removeEventListener(
        "investillo:operacion-no-guardada",
        handleNotSaved,
      );
    };
  }, []);

  return (
    <AlertDialog
      open={notice !== null}
      onOpenChange={(open) => {
        if (!open) setNotice(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {notice?.kind === "queued"
              ? "Guardado en este dispositivo"
              : "No se pudo guardar"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {notice?.kind === "queued"
              ? "La operación quedó guardada en este dispositivo y está pendiente de sincronizar. Aún no está confirmada por el servidor; se enviará automáticamente cuando vuelva la conexión."
              : notice?.reason}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>
            {notice?.kind === "queued" ? "Entendido" : "Cerrar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
