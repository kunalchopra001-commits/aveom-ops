import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(dir, "../../shared/index.ts"),
      "@": path.resolve(dir, "src"),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      filename: "sw.js",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "AVEOM TIME",
        short_name: "AVEOM TIME",
        description: "Log your site shift hours.",
        lang: "en",
        theme_color: "#1f6f5c",
        background_color: "#f5f2ec",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          // SVG icon works for Android/desktop installs. See SETUP.md to add
          // rasterised PNG icons (192 / 512 / maskable) before a production launch.
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/admin/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173 },
  build: {
    target: "es2020",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: [
            "firebase/app",
            "firebase/auth",
            "firebase/firestore",
            "firebase/functions",
            "firebase/storage",
          ],
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
});
