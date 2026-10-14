import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { preferenciasUsuarioTable } from "@workspace/db/schema";

const router: IRouter = Router();
const PERFILES = ["administrador", "secretaria", "propietario"] as const;
const COLORES = [
  "verde",
  "turquesa",
  "azul",
  "cian",
  "ambar",
  "naranja",
  "rosa",
  "rojo",
  "violeta",
  "indigo",
  "verde-claro",
  "gris",
  "blanco",
] as const;
const CATEGORIAS = ["principal", "graficas", "botones"] as const;
type Perfil = (typeof PERFILES)[number];
type Color = (typeof COLORES)[number];
type Categoria = (typeof CATEGORIAS)[number];

function limpiarPreferencias(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, any>;
  if (value.tema !== "light" && value.tema !== "dark") return null;
  if (!Number.isFinite(value.tamanoLetra) || value.tamanoLetra < 14 || value.tamanoLetra > 24 || !Number.isInteger(value.tamanoLetra * 2)) return null;
  if (typeof value.contraste !== "boolean" || typeof value.incluirIvaVentasDiarias !== "boolean") return null;
  const brillo = Number(value.brilloOscuro);
  if (!Number.isFinite(brillo) || brillo < 0 || brillo > 12) return null;
  const colores: Record<string, Record<string, Color | null>> = {};
  const activas: Record<string, Record<string, boolean>> = {};
  for (const modo of ["light", "dark"] as const) {
    const coloresModo = value.colores?.[modo];
    const activasModo = value.activas?.[modo];
    if (!coloresModo || !activasModo) return null;
    colores[modo] = {};
    activas[modo] = {};
    for (const categoria of CATEGORIAS) {
      const color = coloresModo[categoria];
      if (color !== null && !COLORES.includes(color)) return null;
      if (typeof activasModo[categoria] !== "boolean") return null;
      colores[modo][categoria] = color;
      activas[modo][categoria] = activasModo[categoria];
    }
  }
  return {
    tema: value.tema,
    tamanoLetra: value.tamanoLetra,
    contraste: value.contraste,
    brilloOscuro: brillo,
    incluirIvaVentasDiarias: value.incluirIvaVentasDiarias,
    colores,
    activas,
  };
}

router.get("/", async (req, res) => {
  const perfil = String(req.query.perfil || "") as Perfil;
  if (!PERFILES.includes(perfil)) {
    res.status(400).json({ error: "Perfil no válido" });
    return;
  }
  const [configuracion] = await db.select().from(preferenciasUsuarioTable).where(eq(preferenciasUsuarioTable.perfil, perfil));
  res.json(configuracion ?? { perfil, nombre: perfil, tipoUsuario: perfil, preferencias: null });
});

router.put("/", async (req, res) => {
  const perfil = String(req.body?.perfil || "") as Perfil;
  const nombre = typeof req.body?.nombre === "string" ? req.body.nombre.trim().slice(0, 50) : "";
  const preferencias = limpiarPreferencias(req.body?.preferencias);
  if (!PERFILES.includes(perfil) || !nombre || !preferencias) {
    res.status(400).json({ error: "Perfil, nombre o preferencias no válidos" });
    return;
  }
  const [configuracion] = await db.insert(preferenciasUsuarioTable).values({
    perfil,
    nombre,
    tipoUsuario: perfil,
    preferencias,
    actualizadoEn: new Date(),
  }).onConflictDoUpdate({
    target: preferenciasUsuarioTable.perfil,
    set: { nombre, tipoUsuario: perfil, preferencias, actualizadoEn: new Date() },
  }).returning();
  res.json(configuracion);
});

export default router;
