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
    <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center gap-2 whitespace-nowrap text-sm lg:text-base font-bold text-primary drop-shadow-[0_2px_5px_rgba(0,0,0,0.45)]">
      <Clock className="w-4 h-4 lg:w-5 lg:h-5 drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]" />
      <span>{hora} <span className="text-xs lg:text-sm text-foreground/80">(Colombia)</span></span>
    </div>
  );
}