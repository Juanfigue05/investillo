import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

export function RelojColombia() {
  const [hora, setHora] = useState("");

  useEffect(() => {
    const actualizar = () => {
      setHora(new Date().toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    };
    actualizar();
    const interval = setInterval(actualizar, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-center gap-2 py-2 border-t border-border text-xs text-muted-foreground">
      <Clock className="w-3.5 h-3.5" />
      <span>{hora} (Colombia)</span>
    </div>
  );
}