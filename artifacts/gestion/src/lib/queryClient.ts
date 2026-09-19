import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutos: no vuelvas a pedir lo mismo si ya lo trajiste hace poco
      gcTime: 15 * 60 * 1000,   // mantenlo guardado en memoria 15 minutos, por si vuelves a esa pantalla
    },
  },
});