/**
 * Web Push (アプリを閉じていても届く通知) のクライアント側。
 * 必要: Supabase にログイン済み + VITE_VAPID_PUBLIC_KEY + 対応ブラウザ (iPhone はホーム画面に追加したアプリのみ)。
 */
import { supabase } from "./supabase";
import type { PushSchedule } from "./pushSchedule";

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const pushConfigured = !!VAPID && !!supabase;

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlB64ToUint8Array(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** この端末を通知の受け取り先に登録する */
export async function enablePush(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pushConfigured || !supabase) return { ok: false, error: "クラウド通知が設定されていません" };
  if (!pushSupported()) return { ok: false, error: "この端末・ブラウザでは使えません（iPhone はホーム画面に追加したアプリで使えます）" };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, error: "通知が許可されていません" };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID!) as BufferSource }));
    const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert({ user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200), updated_at: new Date().toISOString() }, { onConflict: "endpoint" });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** この端末への通知をやめる */
export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supabase?.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
  } catch {
    /* 解除できなくても致命的ではない */
  }
}

/** 送信予定をサーバーへ反映 (子ども × 種類ごとに1行を上書き) */
export async function uploadSchedules(userId: string, schedules: PushSchedule[]): Promise<void> {
  if (!supabase) return;
  const rows = schedules.map((s) => ({
    user_id: userId,
    child_id: s.childId,
    kind: s.kind,
    send_at: s.sendAt,
    title: s.title,
    body: s.body,
    silent: s.silent,
    repeat_daily: s.repeatDaily,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("push_schedules").upsert(rows, { onConflict: "child_id,kind" });
  if (error) throw new Error(error.message);
}
