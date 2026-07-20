/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "タニメモ",
        short_name: "タニメモ",
        lang: "ja",
        start_url: "/",
        display: "standalone",
        background_color: "#faf7f0",
        theme_color: "#2b6cb0",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  test: { environment: "node", setupFiles: ["./src/test-setup.ts"] },
});
