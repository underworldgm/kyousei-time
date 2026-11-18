import { useState } from "react";
import { clearAllLocalData, seedPreviewData } from "../db/repo";

/** プレビュー版だけに出す小さな案内 */
export function PreviewBanner() {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside className="preview-banner" aria-label="プレビュー版について">
      <p>
        <strong>プレビュー版</strong> サンプルの記録が入っています。操作した内容はこのブラウザの中だけに保存されます。
      </p>
      <div className="preview-actions">
        <button type="button" disabled={busy} onClick={() => void run(async () => { await clearAllLocalData(); await seedPreviewData(true); })}>
          サンプルに戻す
        </button>
        <button type="button" disabled={busy} onClick={() => void run(clearAllLocalData)}>
          からっぽで試す
        </button>
      </div>
    </aside>
  );
}
