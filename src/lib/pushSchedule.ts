/**
 * Web Push の送信予定を計算する (純粋関数)。
 * アプリを閉じていても、サーバー (Supabase Edge Function) がこの時刻に通知を送る。
 */
import { addDays, fmtDuration, fromJst, summarizeDay, type Interval } from "./time";
import { GOAL_TEXT } from "./notifications";

export type PushKind = "goal" | "reminder";

export interface PushSchedule {
  childId: string;
  kind: PushKind;
  /** null なら送らない */
  sendAt: string | null;
  title: string;
  body: string;
  silent: boolean;
  repeatDaily: boolean;
}

export interface ScheduleInput {
  childId: string;
  childName: string;
  intervals: Interval[];
  wearing: boolean;
  todayKey: string;
  targetMinutes: number;
  now: number;
  notificationsEnabled: boolean;
  reminderEnabled: boolean;
  reminderTime: string;
  notificationSound: boolean;
}

export function computePushSchedules(i: ScheduleInput): PushSchedule[] {
  const sum = summarizeDay(i.intervals, i.todayKey, i.targetMinutes);
  const silent = !i.notificationSound;
  const who = i.childName ? `${i.childName}の` : "";
  // 目標達成: 装着中で、まだ届いていないときだけ (外したら取り消し)
  const goalAt = i.notificationsEnabled && i.wearing && !sum.achieved ? new Date(i.now + sum.remainingMs).toISOString() : null;
  // リマインダー: 今日の時刻がまだ来ていて未達成なら今日、そうでなければ明日
  let reminderAt: string | null = null;
  if (i.reminderEnabled) {
    const today = fromJst(i.todayKey, i.reminderTime);
    // 装着中で、リマインダーの時刻までに目標に届く見込みなら今日は送らない
    const reachedBefore = goalAt !== null && Date.parse(goalAt) <= today;
    const useToday = today > i.now && !sum.achieved && !reachedBefore;
    reminderAt = new Date(useToday ? today : fromJst(addDays(i.todayKey, 1), i.reminderTime)).toISOString();
  }
  return [
    { childId: i.childId, kind: "goal", sendAt: goalAt, title: GOAL_TEXT.title, body: `${who}${GOAL_TEXT.body}`, silent, repeatDaily: false },
    {
      childId: i.childId,
      kind: "reminder",
      sendAt: reminderAt,
      title: GOAL_TEXT.title,
      body: `${who}今日の装着はどうかな？ 目標は${fmtDuration(i.targetMinutes, { short: true })}だよ。`,
      silent,
      repeatDaily: true,
    },
  ];
}
