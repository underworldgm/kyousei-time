export type NotifySupport = "supported" | "unsupported";

export const notificationsSupported = () => typeof window !== "undefined" && "Notification" in window;

export function permissionState(): NotificationPermission | "unsupported" {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

/** 通知を ON にしたタイミングで呼ぶ。許可が必要なら要求する。 */
export async function ensurePermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission === "default") {
    try {
      return await Notification.requestPermission();
    } catch {
      return Notification.permission;
    }
  }
  return Notification.permission;
}

/** ServiceWorker 経由 (PWA / Android で確実) → だめなら通常の Notification */
export async function showNotification(title: string, body: string, tag: string): Promise<boolean> {
  if (!notificationsSupported() || Notification.permission !== "granted") return false;
  const options: NotificationOptions = { body, tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", lang: "ja" };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch {
    /* fallthrough */
  }
  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

export const notifyGoalReached = () => showNotification("きょうせいタイム", "目標の装着時間になりました！\nよくがんばりました！", "goal-reached");

/** 将来の Badge API 対応用 (未達成のとき 1 を表示するなど)。現在は呼び出し元なし。 */
export function setAppBadge(count: number): void {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count > 0) void nav.setAppBadge?.(count);
    else void nav.clearAppBadge?.();
  } catch {
    /* 非対応環境は無視 */
  }
}
