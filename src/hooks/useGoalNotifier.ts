import { useEffect } from "react";
import { db } from "../db/indexedDb";
import { notifyGoalReached, notifyReminder, setAppBadge } from "../lib/notifications";
import { withSettingDefaults } from "../db/repo";
import { fmtDuration, fromJst, summarizeDay } from "../lib/time";
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
        if (first && !cancelled) await notifyGoalReached(settings.notificationSound !== false);
      } catch {
        /* 通知できなくてもアプリは続行 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reached, active?.id, settings?.notificationsEnabled, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** 1日1回だけ実行するための印 (確認と記録を1トランザクションで) */
async function onceToday(key: string): Promise<boolean> {
  return db.transaction("rw", db.meta, async () => {
    if (await db.meta.get(key)) return false;
    await db.meta.put({ key, value: true });
    return true;
  });
}

/** リマインダーの時刻を過ぎてから2時間以内に、まだ未達成で外していれば1日1回お知らせする (アプリを開いている間) */
export const REMINDER_WINDOW_MS = 2 * 3600_000;

export function useReminder(d: AppData) {
  const { active, settings, intervals, todayKey, targetMinutes, loaded, now } = d;
  const st = settings ? withSettingDefaults(settings) : null;
  const sum = summarizeDay(intervals, todayKey, targetMinutes);
  const at = st ? fromJst(todayKey, st.reminderTime) : NaN;
  const due = loaded && !!st?.reminderEnabled && !sum.achieved && !active && now >= at && now < at + REMINDER_WINDOW_MS;
  useEffect(() => {
    if (!due || !st) return;
    void (async () => {
      try {
        if (await onceToday(`reminder:${todayKey}`)) await notifyReminder(fmtDuration(sum.remainingMinutes), st.notificationSound);
      } catch {
        /* 通知できなくてもアプリは続行 */
      }
    })();
  }, [due, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** 未達成のあいだ、アプリのアイコンにしるし (Badge API) を付ける */
export function useAppBadge(d: AppData) {
  const { settings, intervals, todayKey, targetMinutes, loaded } = d;
  const on = settings ? withSettingDefaults(settings).badgeEnabled : false;
  const achieved = summarizeDay(intervals, todayKey, targetMinutes).achieved;
  useEffect(() => {
    if (!loaded) return;
    setAppBadge(on && !achieved ? 1 : 0);
  }, [loaded, on, achieved]);
}
