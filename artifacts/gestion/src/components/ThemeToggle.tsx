import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [claro, setClaro] = useState(false);

  useEffect(() => {
    const guardado = localStorage.getItem("investillo-tema");
    const esClaro = guardado === "light";
    setClaro(esClaro);
    document.documentElement.classList.toggle("light", esClaro);
  }, []);

  const alternar = () => {
    const nuevoClaro = !claro;
    setClaro(nuevoClaro);
    document.documentElement.classList.toggle("light", nuevoClaro);
    localStorage.setItem("investillo-tema", nuevoClaro ? "light" : "dark");
  };

  return (
    <button
      onClick={alternar}
      aria-label={claro ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
      className="flex flex-col items-center justify-center gap-0.5 w-14 py-1.5 rounded-xl hover:bg-muted transition-colors"
    >
      {claro ? <Moon className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" /> : <Sun className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />}
      <span className="text-[9px] text-muted-foreground leading-none">{claro ? "Oscuro" : "Claro"}</span>
    </button>
  );
}