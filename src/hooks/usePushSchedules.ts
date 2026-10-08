import { useEffect, useRef } from "react";
import type { AppData } from "../app/AppData";
import { useLive } from "./useLive";
import { useSyncState } from "./useSyncState";
import { getMeta } from "../db/indexedDb";
import { withSettingDefaults } from "../db/repo";
import { pushConfigured, uploadSchedules } from "../lib/push";
import { computePushSchedules } from "../lib/pushSchedule";

const pushEnabledQuery = () => getMeta<boolean>("pushEnabled").then((v) => !!v);

/**
 * クラウド通知が有効なとき、装着開始・終了・設定変更のたびに送信予定をサーバーへ反映する。
 * オフライン中は送らず、オンラインに戻ったときに最新の予定を送る。
 */
export function usePushSchedules(d: AppData) {
  const { value: enabled } = useLive(pushEnabledQuery, false);
  const online = useSyncState().online;
  const last = useRef<string>("");
  const { identity, settings, child, intervals, active, todayKey, targetMinutes, loaded } = d;
  // 毎秒変わる値 (now) ではなく、予定が変わる要因だけで再計算する
  const minuteBucket = Math.floor(d.now / 60_000);
  useEffect(() => {
    if (!pushConfigured || !enabled || !online || !loaded || !identity.authenticated || !settings) return;
    const st = withSettingDefaults(settings);
    const schedules = computePushSchedules({
      childId: identity.childId,
      childName: child?.name ?? "",
      intervals,
      wearing: !!active,
      todayKey,
      targetMinutes,
      now: d.now,
      notificationsEnabled: st.notificationsEnabled,
      reminderEnabled: st.reminderEnabled,
      reminderTime: st.reminderTime,
      notificationSound: st.notificationSound,
    });
    // 予定時刻の数秒のゆらぎで毎分送り直さないよう、分単位に丸めて比較する
    const sig = JSON.stringify(schedules.map((s) => [s.kind, s.sendAt && Math.round(Date.parse(s.sendAt) / 60_000), s.body, s.silent]));
    if (sig === last.current) return;
    last.current = sig;
    uploadSchedules(identity.userId, schedules).catch(() => {
      last.current = ""; // 失敗したら次の機会に再送
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, online, loaded, identity.authenticated, identity.childId, settings, child?.name, active?.id, active?.startTime, todayKey, targetMinutes, intervals.length, minuteBucket]);
}
