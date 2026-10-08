/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  // プレビュー版 (npm run build:preview): 1ファイルにまとめて claude.ai の Artifact として公開する
  ...(mode === "artifact"
    ? {
        base: "./",
        build: {
          outDir: "dist-artifact",
          assetsInlineLimit: 100_000_000,
          cssCodeSplit: false,
          rollupOptions: { input: "preview.html" },
        },
      }
    : {}),
  plugins: [
    react(),
    VitePWA({
      disable: mode === "artifact",
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
        // Supabase API はキャッシュしない (Service Worker を通さず常にネットワーク)。
        // データは IndexedDB First で保持しているため、古い API 応答をキャッシュから返すと
        // 「同期済み」と誤表示したり、ログアウト後も個人データがキャッシュに残ったりするため。
        runtimeCaching: [
          {
            // Webフォント: 使った分割ファイルだけ端末に保存 (Cache First)
            urlPattern: ({ request }) => request.destination === "font",
            handler: "CacheFirst",
            options: { cacheName: "fonts", expiration: { maxEntries: 600, maxAgeSeconds: 365 * 86400 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  test: { environment: "node", include: ["tests/**/*.test.ts"], setupFiles: ["tests/setup.ts"] },
}));
