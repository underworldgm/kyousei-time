import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app/App";
import { ensureBootstrap, pruneOutbox, seedPreviewData } from "./db/repo";
import { configureRemote, startSyncRuntime } from "./lib/sync";
import { supabaseRemote } from "./lib/remoteSupabase";
import "./styles/tokens.css";
import "./styles/global.css";

async function boot() {
  try {
    await ensureBootstrap();
    await pruneOutbox();
    if (import.meta.env.VITE_PREVIEW) await seedPreviewData();
    // 端末ストレージの自動削除を避ける (データを失わない)
    void navigator.storage?.persist?.();
  } catch (e) {
    console.error("IndexedDB の初期化に失敗しました", e); // App 側の liveQuery がエラー画面を出す
  }
  startSyncRuntime();
  configureRemote(supabaseRemote);
  // 新しい版がデプロイされたら自動更新 (古いアプリが残り続けない)
  registerSW({ immediate: true });
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  // フォント定義は大きいので描画後に別チャンクで読み込む (読み込み前は端末の丸ゴシック/システムフォント)
  if (!import.meta.env.VITE_PREVIEW) void import("./styles/fonts").catch(() => undefined);
}
void boot();
