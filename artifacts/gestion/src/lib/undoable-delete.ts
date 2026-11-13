export function programarBorradoReversible(
  confirmar: () => void,
  demoraMs: number,
): () => void {
  const temporizador = setTimeout(confirmar, demoraMs);
  return () => clearTimeout(temporizador);
}
