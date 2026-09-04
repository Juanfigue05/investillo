import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { cartographer } from "@replit/vite-plugin-cartographer";
import { devBanner } from "@replit/vite-plugin-dev-banner";
import type { UserConfig, ConfigEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(
  async ({ command }: ConfigEnv): Promise<UserConfig> => {
    const isBuild = command === "build";

    const rawPort = process.env.PORT;
    if (!isBuild && !rawPort) {
      throw new Error(
        "PORT environment variable is required but was not provided.",
      );
    }
    const port = isBuild ? 5173 : Number(rawPort);
    if (!isBuild && (Number.isNaN(port) || port <= 0)) {
      throw new Error(`Invalid PORT value: "${rawPort}"`);
    }

    const rawBasePath = process.env.BASE_PATH;
    if (!isBuild && !rawBasePath) {
      throw new Error(
        "BASE_PATH environment variable is required but was not provided.",
      );
    }
    const basePath = (rawBasePath || "/").replace(/\/?$/, "/");

    return {
      base: basePath,
      plugins: [
        react(),
        tailwindcss(),
        runtimeErrorOverlay(),
        VitePWA({
          registerType: "autoUpdate",
          devOptions: { enabled: true },
          manifest: {
            name: "Investillo",
            short_name: "Investillo",
            description: "Gestión con estilo y sencillo",
            theme_color: "#03070f",
            background_color: "#03070f",
            display: "standalone",
            start_url: basePath,
            scope: basePath,
            icons: [
              {
                src: `${basePath}icon-192.png`,
                sizes: "192x192",
                type: "image/png",
              },
              {
                src: `${basePath}icon-512.png`,
                sizes: "512x512",
                type: "image/png",
              },
              {
                src: `${basePath}icon-512.png`,
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable",
              },
            ],
          },
          workbox: {
            globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
            navigateFallback: `${basePath}index.html`,
            navigateFallbackDenylist: [/^\/api/],
          },
        }),
        ...(process.env.NODE_ENV !== "production" &&
        process.env.REPL_ID !== undefined
          ? [
              await import("@replit/vite-plugin-cartographer").then((m) =>
                m.cartographer({
                  root: path.resolve(import.meta.dirname, ".."),
                }),
              ),
              await import("@replit/vite-plugin-dev-banner").then((m) =>
                m.devBanner(),
              ),
            ]
          : []),
      ],
      resolve: {
        alias: {
          "@": path.resolve(import.meta.dirname, "src"),
          "@assets": path.resolve(
            import.meta.dirname,
            "..",
            "..",
            "attached_assets",
          ),
        },
        dedupe: ["react", "react-dom"],
      },
      root: path.resolve(import.meta.dirname),
      build: {
        outDir: path.resolve(import.meta.dirname, "dist/public"),
        emptyOutDir: true,
      },
      server: {
        port,
        host: "0.0.0.0",
        allowedHosts: true,
        proxy: {
          "/api": { target: "http://localhost:8080", changeOrigin: true },
        },
        fs: { strict: true, deny: ["**/.*"] },
      },
      preview: {
        port,
        host: "0.0.0.0",
        allowedHosts: true,
      },
    };
  },
);
