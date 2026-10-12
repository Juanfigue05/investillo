import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CircleUserRound, Settings2, LockKeyhole, Sun, Moon, X, Check } from "lucide-react";

type Mode = "light" | "dark";
type Category = "principal" | "graficas" | "botones";
type Palette = "verde" | "turquesa" | "azul" | "cian" | "ambar" | "naranja" | "rosa" | "rojo";
type Settings = {
  tema: Mode;
  tamanoLetra: number;
  contraste: boolean;
  brilloOscuro: number;
  incluirIvaVentasDiarias: boolean;
  colores: Record<Mode, Record<Category, Palette>>;
  activas: Record<Mode, Record<Category, boolean>>;
};

const PROFILES = ["administrador", "secretaria", "propietario"] as const;
const PROFILE_NAMES: Record<(typeof PROFILES)[number], string> = {
  administrador: "Administrador",
  secretaria: "Secretaria",
  propietario: "Propietario",
};
const PALETTES: { key: Palette; label: string; hue: number; saturation: number }[] = [
  { key: "verde", label: "Verde", hue: 142, saturation: 58 },
  { key: "turquesa", label: "Turquesa", hue: 172, saturation: 58 },
  { key: "azul", label: "Azul", hue: 215, saturation: 58 },
  { key: "cian", label: "Cian", hue: 190, saturation: 58 },
  { key: "ambar", label: "Ámbar", hue: 42, saturation: 58 },
  { key: "naranja", label: "Naranja", hue: 25, saturation: 58 },
  { key: "rosa", label: "Rosa", hue: 340, saturation: 58 },
  { key: "rojo", label: "Rojo", hue: 4, saturation: 58 },
];
const CATEGORY_NAMES: Record<Category, string> = {
  principal: "Color principal",
  graficas: "Colores de gráficas",
  botones: "Colores de botones",
};
const DEFAULT_SETTINGS: Settings = {
  tema: "dark",
  tamanoLetra: 18,
  contraste: false,
  brilloOscuro: 4,
  incluirIvaVentasDiarias: false,
  colores: {
    light: { principal: "azul", graficas: "turquesa", botones: "verde" },
    dark: { principal: "azul", graficas: "turquesa", botones: "verde" },
  },
  activas: {
    light: { principal: false, graficas: false, botones: false },
    dark: { principal: false, graficas: false, botones: false },
  },
};

function loadLocalSettings(profile: string): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(`investillo-preferencias-${profile}`) || "null");
    if (!saved) return { ...DEFAULT_SETTINGS, tema: localStorage.getItem("investillo-tema") === "light" ? "light" : "dark" };
    return { ...DEFAULT_SETTINGS, ...saved, colores: { ...DEFAULT_SETTINGS.colores, ...saved.colores }, activas: { ...DEFAULT_SETTINGS.activas, ...saved.activas } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function applySettings(settings: Settings) {
  const root = document.documentElement;
  const mode = settings.tema;
  const modeSettings = settings.colores[mode];
  const enabled = settings.activas[mode];
  const primary = PALETTES.find((item) => item.key === modeSettings.principal)!;
  const button = PALETTES.find((item) => item.key === modeSettings.botones)!;
  root.classList.toggle("light", mode === "light");
  root.classList.toggle("custom-primary-colors", enabled.principal);
  root.classList.toggle("custom-chart-colors", enabled.graficas);
  root.classList.toggle("custom-button-colors", enabled.botones);
  root.classList.toggle("high-contrast-text", settings.contraste);
  root.style.fontSize = `${settings.tamanoLetra}px`;
  root.style.setProperty("--custom-primary", `${primary.hue} ${primary.saturation}% ${mode === "light" ? "42%" : "58%"}`);
  root.style.setProperty("--custom-button", `${button.hue} ${button.saturation}% ${mode === "light" ? "40%" : "54%"}`);
  const chart = PALETTES.find((item) => item.key === modeSettings.graficas)!;
  for (let index = 0; index < 8; index += 1) {
    const color = `hsl(${(chart.hue + index * 36) % 360} ${chart.saturation}% ${mode === "light" ? "43%" : "62%"})`;
    root.style.setProperty(`--custom-chart-${index + 1}`, color);
    if (enabled.graficas) root.style.setProperty(`--graph-color-${index + 1}`, color);
    else root.style.removeProperty(`--graph-color-${index + 1}`);
    if (!enabled.graficas) root.style.removeProperty(`--custom-chart-${index + 1}`);
  }
  if (mode === "dark") {
    const lift = settings.brilloOscuro / 1.5;
    root.style.setProperty("--background", `224 71% ${4 + lift}%`);
    root.style.setProperty("--card", `222 47% ${11 + lift}%`);
    root.style.setProperty("--muted", `223 47% ${14 + lift}%`);
  } else {
    root.style.removeProperty("--background");
    root.style.removeProperty("--card");
    root.style.removeProperty("--muted");
  }
  root.style.setProperty("--contrast-foreground", mode === "light" ? "0 0% 0%" : "0 0% 100%");
  localStorage.setItem("investillo-tema", mode);
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} style={{ width: 44, height: 24 }} className={`relative shrink-0 rounded-full transition-colors ${checked ? "bg-green-700 dark:bg-green-500" : "bg-muted-foreground/40"}`}>
      <span
        className="absolute rounded-full bg-white shadow-sm"
        style={{ left: 2, top: 2, width: 20, height: 20, transform: checked ? "translateX(20px)" : "translateX(0)" }}
      />
    </button>
  );
}

export function UserMenu() {
  const [profile, setProfile] = useState(() => localStorage.getItem("investillo-perfil") || "administrador");
  const [profileName, setProfileName] = useState(PROFILE_NAMES[profile as keyof typeof PROFILE_NAMES] || "Administrador");
  const [settings, setSettings] = useState<Settings>(() => loadLocalSettings(profile));
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<Mode>(settings.tema);
  const [saveState, setSaveState] = useState("");

  useEffect(() => {
    applySettings(settings);
    localStorage.setItem(`investillo-preferencias-${profile}`, JSON.stringify(settings));
  }, [settings, profile]);

  useEffect(() => {
    let active = true;
    const localSettings = loadLocalSettings(profile);
    setSettings(localSettings);
    setProfileName(PROFILE_NAMES[profile as keyof typeof PROFILE_NAMES] || "Administrador");
    localStorage.setItem("investillo-perfil", profile);
    fetch(`${import.meta.env.BASE_URL}api/preferencias?perfil=${encodeURIComponent(profile)}`.replace(/\/+/g, "/"))
      .then((response) => response.ok ? response.json() : null)
      .then((record) => {
        if (!active || !record) return;
        if (record.preferencias) {
          if (record.nombre) setProfileName(record.nombre);
          setSettings({ ...DEFAULT_SETTINGS, ...record.preferencias });
        }
      })
      .catch(() => setSaveState("Sin conexión: se usan las preferencias guardadas en este equipo."));
    return () => { active = false; };
  }, [profile]);

  const saveSettings = async (preferences = settings, name = profileName) => {
    setSaveState("Guardando...");
    localStorage.setItem(`investillo-preferencias-${profile}`, JSON.stringify(preferences));
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/preferencias`.replace(/\/+/g, "/"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfil: profile, nombre: name, preferencias: preferences }),
      });
      if (!response.ok) throw new Error("No se pudieron guardar los cambios en el servidor.");
      setSaveState("Preferencias sincronizadas.");
    } catch {
      setSaveState("Sin conexión: se guardaron solo en este equipo.");
    }
  };

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((current) => ({ ...current, [key]: value }));
  const toggleTheme = () => {
    const nextSettings: Settings = { ...settings, tema: settings.tema === "light" ? "dark" : "light" };
    setSettings(nextSettings);
    void saveSettings(nextSettings);
  };
  const setCategoryEnabled = (category: Category, value: boolean) => setSettings((current) => ({ ...current, activas: { ...current.activas, [paletteMode]: { ...current.activas[paletteMode], [category]: value } } }));
  const setCategoryColor = (category: Category, value: Palette) => setSettings((current) => ({ ...current, colores: { ...current.colores, [paletteMode]: { ...current.colores[paletteMode], [category]: value } } }));

  return (
    <div className="relative">
      <button type="button" aria-label="Menú de usuario" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} className="flex h-[50px] w-[50px] lg:h-[67px] lg:w-[67px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl transition-colors hover:bg-muted">
        <CircleUserRound className="h-5 w-5 text-muted-foreground lg:h-6 lg:w-6" />
        <span className="max-w-full truncate text-[10px] leading-none text-muted-foreground">{profileName.split(" ")[0]}</span>
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-full z-[70] mt-2 w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Sección de usuario</p>
            <label className="mt-2 block text-xs text-muted-foreground">Perfil de preferencias
              <select value={profile} onChange={(event) => { setProfile(event.target.value); setMenuOpen(false); }} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                {PROFILES.map((item) => <option key={item} value={item}>{PROFILE_NAMES[item]}</option>)}
              </select>
            </label>
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div><p className="text-sm font-medium">Modo de color</p><p className="text-xs text-muted-foreground">{settings.tema === "light" ? "Claro" : "Oscuro"}</p></div>
            <button type="button" onClick={toggleTheme} aria-label="Cambiar modo claro u oscuro" className="rounded-lg p-2 text-foreground hover:bg-muted">{settings.tema === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}</button>
          </div>
          <button type="button" onClick={() => { setSettingsOpen(true); setMenuOpen(false); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted"><Settings2 className="h-4 w-4" /> Configuración</button>
          <form action="/bloquear" method="post" className="border-t border-border">
            <button type="submit" className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-destructive hover:bg-muted"><LockKeyhole className="h-4 w-4" /> Bloquear sesión</button>
          </form>
        </div>
      )}
      {settingsOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="system-settings-title" className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <div><h2 id="system-settings-title" className="text-lg font-semibold">Configuración</h2><p className="text-xs text-muted-foreground">Preferencias del perfil {PROFILE_NAMES[profile as keyof typeof PROFILE_NAMES]}</p></div>
              <button type="button" aria-label="Cerrar configuración" onClick={() => setSettingsOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </header>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-muted-foreground">Nombre del perfil
                  <input value={profileName} onChange={(event) => setProfileName(event.target.value)} maxLength={50} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
                </label>
                <label className="text-xs font-medium text-muted-foreground">Tipo de usuario
                  <select value={profile} onChange={(event) => setProfile(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                    {PROFILES.map((item) => <option key={item} value={item}>{PROFILE_NAMES[item]}</option>)}
                  </select>
                </label>
              </div>
              <section className="border-t border-border pt-4">
                <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Colores</h3><p className="text-xs text-muted-foreground">Una selección por sección y modo.</p></div>
                  <div className="flex rounded-lg border border-border p-0.5">
                    {(["light", "dark"] as const).map((mode) => <button key={mode} type="button" onClick={() => setPaletteMode(mode)} className={`rounded-md px-3 py-1.5 text-xs ${paletteMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{mode === "light" ? "Claro" : "Oscuro"}</button>)}
                  </div>
                </div>
                <div className="divide-y divide-border">
                  {(["principal", "graficas", "botones"] as const).map((category) => (
                    <div key={category} className="space-y-3 py-3">
                      <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">{CATEGORY_NAMES[category]}</p><p className="text-xs text-muted-foreground">{settings.activas[paletteMode][category] ? "Personalizado" : "Color actual del sistema"}</p></div><Switch checked={settings.activas[paletteMode][category]} onChange={(value) => setCategoryEnabled(category, value)} label={`Activar ${CATEGORY_NAMES[category].toLowerCase()} en modo ${paletteMode}`} /></div>
                      {settings.activas[paletteMode][category] && <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`${CATEGORY_NAMES[category]} para modo ${paletteMode}`}>
                        {PALETTES.map((palette) => <button key={palette.key} type="button" role="radio" aria-checked={settings.colores[paletteMode][category] === palette.key} aria-label={palette.label} title={palette.label} onClick={() => setCategoryColor(category, palette.key)} className={`grid h-9 w-9 place-items-center rounded-full border-2 ${settings.colores[paletteMode][category] === palette.key ? "border-foreground" : "border-transparent"}`} style={{ backgroundColor: `hsl(${palette.hue} ${palette.saturation}% ${paletteMode === "light" ? "42%" : "60%"})` }}>{settings.colores[paletteMode][category] === palette.key && <Check className="h-4 w-4 text-white" />}</button>)}
                      </div>}
                    </div>
                  ))}
                </div>
              </section>
              <section className="space-y-4 border-t border-border pt-4">
                <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">Mayor contraste de letra</p><p className="text-xs text-muted-foreground">Negro en modo claro y blanco en modo oscuro.</p></div><Switch checked={settings.contraste} onChange={(value) => updateSetting("contraste", value)} label="Aumentar contraste de letra" /></div>
                {settings.tema === "dark" && <label className="block text-sm font-medium">Brillo del modo oscuro <span className="text-muted-foreground">{settings.brilloOscuro}/12</span><input type="range" min="0" max="12" step="1" value={settings.brilloOscuro} onChange={(event) => updateSetting("brilloOscuro", Number(event.target.value))} className="mt-2 w-full accent-primary" aria-label="Brillo del modo oscuro" /></label>}
                <label className="block text-sm font-medium">Tamaño de letra <span className="text-muted-foreground">{Number.isInteger(settings.tamanoLetra) ? settings.tamanoLetra : settings.tamanoLetra.toFixed(1)}px</span><input type="range" min="14" max="24" step="0.5" value={settings.tamanoLetra} onChange={(event) => updateSetting("tamanoLetra", Number(event.target.value))} className="mt-2 w-full accent-primary" aria-label="Tamaño de letra del sistema" /></label>
                <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">Incluir IVA en Ventas Diarias</p><p className="text-xs text-muted-foreground">Cuando esté activo, se pedirá confirmación en cada pago.</p></div><Switch checked={settings.incluirIvaVentasDiarias} onChange={(value) => updateSetting("incluirIvaVentasDiarias", value)} label="Incluir la línea de IVA en Ventas Diarias" /></div>
              </section>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
              <p role="status" className="text-xs text-muted-foreground">{saveState}</p>
              <div className="flex gap-2"><button type="button" onClick={() => setSettingsOpen(false)} className="rounded-lg bg-muted px-4 py-2 text-sm">Cerrar</button><button type="button" onClick={() => void saveSettings()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Guardar configuración</button></div>
            </footer>
          </section>
        </div>, document.body,
      )}
    </div>
  );
}
