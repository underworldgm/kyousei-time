import { useEffect } from "react";
import { db } from "../db/indexedDb";
import { notifyGoalReached } from "../lib/notifications";
import { summarizeDay } from "../lib/time";
import type { AppData } from "../app/AppData";

/**
 * 装着中に目標へ到達したら (1日1回) 通知する。
 * 到達判定は保存済みの開始時刻から毎回計算するので、画面を閉じていた間に到達していても、
 * 次に開いたときに (通知が許可されていれば) 通知する。アプリが完全に閉じている間の通知はできない (README参照)。
 */
export function useGoalNotifier(d: AppData) {
  const { active, settings, intervals, todayKey, targetMinutes, loaded } = d;
  const reached = loaded && summarizeDay(intervals, todayKey, targetMinutes).achieved;
  useEffect(() => {
    if (!reached || !active || !settings?.notificationsEnabled) return;
    const key = `goalNotified:${todayKey}`;
    let cancelled = false;
    void (async () => {
      try {
        // 「通知済みか確認 → 記録」を1つのトランザクションで行い、再描画や複数タブでも1日1回にする
        const first = await db.transaction("rw", db.meta, async () => {
          if (await db.meta.get(key)) return false;
          await db.meta.put({ key, value: true });
          return true;
        });
        if (first && !cancelled) await notifyGoalReached();
      } catch {
        /* 通知できなくてもアプリは続行 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reached, active?.id, settings?.notificationsEnabled, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
