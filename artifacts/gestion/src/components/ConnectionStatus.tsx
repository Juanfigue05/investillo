import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function ConnectionStatus() {
  const online = useOnlineStatus();

  return (
    <div
      className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
        online ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
      {online ? "En línea" : "Sin conexión (guardando local)"}
    </div>
  );
}