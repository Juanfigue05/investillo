import { useState, useEffect } from "react";
import { Download, CheckCircle2 } from "lucide-react";

const cardBase = "bg-card rounded-2xl p-4 lg:p-5 border border-border shadow-lg shadow-black/20 hover:shadow-xl transition-all duration-300 hover:-translate-y-1";

export function InstallAppCard() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [instalada, setInstalada] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalada(true);
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const onInstalled = () => { setInstalada(true); setDeferredPrompt(null); };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const instalar = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const estado = instalada
    ? { titulo: "Instalada ✓", sub: "Ya la tienes en este equipo", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" }
    : deferredPrompt
    ? { titulo: "Instalar app", sub: "Ábrela sin el navegador", icon: Download, color: "text-primary", bg: "bg-primary/10" }
    : { titulo: "No disponible", sub: "Recarga o usa Chrome/Edge", icon: Download, color: "text-muted-foreground", bg: "bg-muted" };

  const Icon = estado.icon;
  const clickable = !instalada && deferredPrompt;

  const contenido = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium leading-tight">Investillo</p>
          <h3 className="text-xl lg:text-2xl font-display font-bold mt-1 text-foreground truncate">{estado.titulo}</h3>
        </div>
        <div className={`w-9 h-9 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${estado.bg}`}>
          <Icon className={`w-4 h-4 lg:w-5 lg:h-5 ${estado.color}`} />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
        <span className="truncate">{estado.sub}</span>
      </div>
    </>
  );

  if (clickable) {
    return (
      <button onClick={instalar} className={`${cardBase} text-left w-full`}>
        {contenido}
      </button>
    );
  }

  return <div className={cardBase}>{contenido}</div>;
}