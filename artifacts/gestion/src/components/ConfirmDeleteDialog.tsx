import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { programarBorradoReversible } from "@/lib/undoable-delete";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  title?: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
}

export function ConfirmDeleteDialog({
  open,
  title = "Confirmar eliminación",
  description,
  onCancel,
  onConfirm,
  confirming = false,
}: Props) {
  const ventanaMs = 10_000;
  const [esperandoBorrado, setEsperandoBorrado] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(10);
  const [confirmacionEnviada, setConfirmacionEnviada] = useState(false);
  const temporizadorRef = useRef<(() => void) | null>(null);
  const cuentaRegresivaRef = useRef<number | null>(null);
  const reinicioRef = useRef<number | null>(null);

  const limpiarTemporizadores = () => {
    temporizadorRef.current?.();
    temporizadorRef.current = null;
    if (cuentaRegresivaRef.current !== null) {
      window.clearInterval(cuentaRegresivaRef.current);
      cuentaRegresivaRef.current = null;
    }
    if (reinicioRef.current !== null) {
      window.clearTimeout(reinicioRef.current);
      reinicioRef.current = null;
    }
  };

  useEffect(() => () => limpiarTemporizadores(), []);

  const deshacer = () => {
    limpiarTemporizadores();
    setEsperandoBorrado(false);
    setConfirmacionEnviada(false);
    setSegundosRestantes(10);
    onCancel();
  };

  const programarBorrado = () => {
    if (esperandoBorrado || confirming || confirmacionEnviada) return;
    setEsperandoBorrado(true);
    setSegundosRestantes(10);
    cuentaRegresivaRef.current = window.setInterval(() => {
      setSegundosRestantes((actual) => Math.max(0, actual - 1));
    }, 1_000);
    temporizadorRef.current = programarBorradoReversible(() => {
      if (cuentaRegresivaRef.current !== null) {
        window.clearInterval(cuentaRegresivaRef.current);
        cuentaRegresivaRef.current = null;
      }
      temporizadorRef.current = null;
      setEsperandoBorrado(false);
      setConfirmacionEnviada(true);
      onConfirm();
      reinicioRef.current = window.setTimeout(() => {
        setConfirmacionEnviada(false);
        reinicioRef.current = null;
      }, 2_000);
    }, ventanaMs);
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && deshacer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-line pt-2">
            {description}
            {"\n\nAl confirmar, el borrado se programa por 10 segundos. Puedes deshacerlo antes de que se envíe."}
            {esperandoBorrado && `\n\nEliminación en espera: ${segundosRestantes} segundos.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={deshacer}
            disabled={confirming}
            className="rounded-lg border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/80 disabled:opacity-50"
          >
            {esperandoBorrado ? "Deshacer" : "Cancelar"}
          </button>
          <button
            type="button"
            onClick={programarBorrado}
            disabled={confirming || esperandoBorrado || confirmacionEnviada}
            className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {confirming || confirmacionEnviada
              ? "Eliminando..."
              : esperandoBorrado
                ? `En espera (${segundosRestantes}s)`
                : "Programar eliminación"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
