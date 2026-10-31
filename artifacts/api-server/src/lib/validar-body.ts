import type { Response } from "express";

type ErrorValidacion = {
  issues: Array<{ path: PropertyKey[]; message: string }>;
};

type ResultadoValidacion =
  | { success: true }
  | { success: false; error: ErrorValidacion };

type EsquemaValidacion = {
  safeParse: (valor: unknown) => ResultadoValidacion;
};

export function validarBody(
  esquema: EsquemaValidacion,
  body: unknown,
  res: Response,
): boolean {
  const resultado = esquema.safeParse(body);
  if (resultado.success) return true;

  res.status(400).json({
    error: "Datos inválidos",
    detalles: resultado.error.issues.map(({ path, message }) => ({
      campo: path.map(String).join("."),
      mensaje: message,
    })),
  });
  return false;
}
