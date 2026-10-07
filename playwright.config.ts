import { defineConfig, devices } from "@playwright/test";

/**
 * E2E: 本番ビルド (Service Worker 有効) を preview サーバーで起動して検証する。
 *   npm run e2e
 * ブラウザ未導入の環境では一度だけ `npx playwright install chromium` を実行。
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    locale: "ja-JP",
    timezoneId: "America/New_York", // 端末TZが日本以外でも JST で集計されることも確認
    trace: "retain-on-failure",
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  projects: [
    // Supabase 同期 (モックサーバー) — 環境変数入りの別ビルドを使う
    {
      name: "sync",
      testDir: "e2e-sync",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4174", viewport: { width: 390, height: 844 } },
    },
    { name: "iphone-se", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    { name: "iphone-15", use: { ...devices["Desktop Chrome"], viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    {
      command: "npm run build && npx vite preview --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "npx vite build --mode e2e --outDir dist-e2e && npx vite preview --mode e2e --outDir dist-e2e --port 4174 --strictPort",
      url: "http://localhost:4174",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
