/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", "icons/*.svg"],
      manifest: {
        name: "きょうせいタイム",
        short_name: "きょうせい",
        description: "子どもの歯科矯正器具の装着時間を記録するアプリ",
        lang: "ja",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#38c5ad",
        background_color: "#f7fcfe",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // アプリシェル: precache (Cache First)。古い版は自動で破棄し、新SWは即時有効化。
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        runtimeCaching: [
          {
            // API: Network First (オフライン時はキャッシュ)。書き込みは同期キュー経由なので GET のみ対象。
            urlPattern: ({ url }) => url.hostname.endsWith(".supabase.co"),
            handler: "NetworkFirst",
            options: { cacheName: "supabase-api", networkTimeoutSeconds: 5, expiration: { maxEntries: 50, maxAgeSeconds: 86400 } },
          },
        ],
      },
    }),
  ],
  test: { environment: "node", include: ["tests/**/*.test.ts"], setupFiles: ["tests/setup.ts"] },
});
