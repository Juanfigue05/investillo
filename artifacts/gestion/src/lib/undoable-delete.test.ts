import { afterEach, describe, expect, it, vi } from "vitest";
import { programarBorradoReversible } from "./undoable-delete";

describe("borrado reversible", () => {
  afterEach(() => vi.useRealTimers());

  it("espera la ventana elegida antes de ejecutar el borrado", () => {
    vi.useFakeTimers();
    const confirmar = vi.fn();

    programarBorradoReversible(confirmar, 10_000);
    vi.advanceTimersByTime(9_999);
    expect(confirmar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(confirmar).toHaveBeenCalledOnce();
  });

  it("permite deshacer antes de que termine la ventana", () => {
    vi.useFakeTimers();
    const confirmar = vi.fn();
    const deshacer = programarBorradoReversible(confirmar, 10_000);

    deshacer();
    vi.runAllTimers();
    expect(confirmar).not.toHaveBeenCalled();
  });
});
