/**
 * Web Push の送信処理 (Deno / Node どちらでも動く純粋な部分)。index.ts から使い、テストからも直接呼ぶ。
 * - 送信時刻を過ぎた push_schedules を取り出し、その保護者の全端末へ送る
 * - 送ったあと: 目標達成 (goal) は取り消し、リマインダーは翌日の同じ時刻へ繰り越す
 * - 410/404 が返った端末 (アンインストール・許可取り消し) は登録を削除する
 */

export interface ScheduleRow {
  user_id: string;
  child_id: string;
  kind: "goal" | "reminder";
  send_at: string | null;
  title: string;
  body: string;
  silent: boolean;
  repeat_daily: boolean;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushDeps {
  dueSchedules(nowIso: string): Promise<ScheduleRow[]>;
  subscriptionsFor(userId: string): Promise<SubscriptionRow[]>;
  /** 送信。HTTP ステータスを返す (201 = 成功) */
  send(sub: SubscriptionRow, payload: string): Promise<number>;
  deleteSubscription(id: string): Promise<void>;
  /** 送信済みにする。nextSendAt が null なら取り消し */
  markSent(row: ScheduleRow, nextSendAt: string | null, sentAt: string): Promise<void>;
}

const DAY_MS = 86_400_000;

export interface PushRunResult {
  schedules: number;
  sent: number;
  failed: number;
  removedSubscriptions: number;
}

export async function runPush(deps: PushDeps, now = Date.now()): Promise<PushRunResult> {
  const nowIso = new Date(now).toISOString();
  const res: PushRunResult = { schedules: 0, sent: 0, failed: 0, removedSubscriptions: 0 };
  for (const row of await deps.dueSchedules(nowIso)) {
    res.schedules++;
    // 古すぎる予定 (6時間以上前) は送らずに次回へ (サーバー停止から復帰したときに大量の古い通知を出さない)
    const stale = row.send_at !== null && now - Date.parse(row.send_at) > 6 * 3600_000;
    if (!stale) {
      const payload = JSON.stringify({ title: row.title, body: row.body, tag: `${row.kind}-${row.child_id}`, silent: row.silent, url: "/" });
      for (const sub of await deps.subscriptionsFor(row.user_id)) {
        try {
          const status = await deps.send(sub, payload);
          if (status === 404 || status === 410) {
            await deps.deleteSubscription(sub.id);
            res.removedSubscriptions++;
          } else if (status >= 200 && status < 300) res.sent++;
          else res.failed++;
        } catch {
          res.failed++;
        }
      }
    }
    let next: string | null = null;
    if (row.repeat_daily && row.send_at) {
      let t = Date.parse(row.send_at);
      while (t <= now) t += DAY_MS;
      next = new Date(t).toISOString();
    }
    await deps.markSent(row, next, nowIso);
  }
  return res;
}
