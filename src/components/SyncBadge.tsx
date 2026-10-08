import { useSyncState } from "../hooks/useSyncState";
import { jstHM } from "../lib/time";

/** 小さく邪魔にならない同期状態表示。色だけでなく記号と文字でも状態を示す。 */
export function SyncBadge() {
  const s = useSyncState();
  let icon = "✓";
  let label = "同期済み";
  let tone = "ok";
  if (s.phase === "local" || s.phase === "signed-out") {
    icon = "▣";
    label = "この端末に保存";
    tone = "muted";
  } else if (s.phase === "offline" || !s.online) {
    icon = "○";
    label = s.pending ? `オフライン・同期待ち${s.pending}` : "オフライン";
    tone = "muted";
  } else if (s.phase === "syncing") {
    icon = "↻";
    label = "同期中";
    tone = "busy";
  } else if (s.phase === "error") {
    icon = "!";
    label = "同期エラー";
    tone = "error";
  } else if (s.pending > 0) {
    icon = "↑";
    label = "同期待ち";
    tone = "wait";
  }
  const last = s.lastSyncedAt ? `最終同期 ${jstHM(Date.parse(s.lastSyncedAt))}` : "";
  return (
    <span className={`sync-badge ${tone}`} role="status" aria-live="polite" title={[label, last, s.error ?? ""].filter(Boolean).join(" / ")}>
      <span className={`sync-icon ${tone === "busy" ? "spin" : ""}`} aria-hidden="true">
        {icon}
      </span>
      {label}
      {tone === "ok" && last && <small>{last.replace("最終同期 ", "")}</small>}
    </span>
  );
}
