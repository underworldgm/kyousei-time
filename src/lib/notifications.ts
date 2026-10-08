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
export async function showNotification(title: string, body: string, tag: string, opts: { sound?: boolean } = {}): Promise<boolean> {
  if (!notificationsSupported() || Notification.permission !== "granted") return false;
  // Web では通知音の種類は選べないため、「音あり (端末の通知音) / 音なし (silent)」を切り替える
  const options: NotificationOptions = { body, tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", lang: "ja", silent: opts.sound === false };
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

export const GOAL_TEXT = { title: "きょうせいタイム", body: "目標の装着時間になりました！\nよくがんばりました！" };

export const notifyGoalReached = (sound = true) => showNotification(GOAL_TEXT.title, GOAL_TEXT.body, "goal-reached", { sound });

export const reminderText = (remaining: string) => ({ title: "きょうせいタイム", body: `今日の装着はあと${remaining}だよ。\nいっしょにがんばろう！` });

export const notifyReminder = (remaining: string, sound = true) => {
  const t = reminderText(remaining);
  return showNotification(t.title, t.body, "daily-reminder", { sound });
};

/** Badge API: ホーム画面に追加したアプリのアイコンにしるしを付ける (対応環境のみ。非対応なら何もしない) */
export function setAppBadge(count: number): void {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count > 0) void nav.setAppBadge?.(count);
    else void nav.clearAppBadge?.();
  } catch {
    /* 非対応環境は無視 */
  }
}
