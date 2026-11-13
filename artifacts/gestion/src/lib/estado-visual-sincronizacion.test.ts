import { describe, expect, it } from "vitest";
import { describirEstadoSincronizacion } from "./estado-visual-sincronizacion";

describe("estado visible de sincronización", () => {
  it("distingue sincronizado, pendiente y operación con error", () => {
    expect(describirEstadoSincronizacion(true, 0, 0)).toEqual({
      label: "Sincronizado",
      tono: "correcto",
    });
    expect(describirEstadoSincronizacion(false, 2, 0).tono).toBe("pendiente");
    expect(describirEstadoSincronizacion(true, 1, 1).tono).toBe("error");
  });
});
