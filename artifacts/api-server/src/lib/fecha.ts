export function fechaColombia(fecha: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(fecha);
}

export function fechaHoyColombia(): string {
  return fechaColombia(new Date());
}