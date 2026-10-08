/** グラフ画面用の集計 (純粋関数) */
import { addDays, dayTotalMs, MIN_MS, targetOn, weekdayOf, type Interval, type TargetSpec } from "./time";

export interface DayPoint {
  dayKey: string;
  minutes: number;
  target: number;
  achieved: boolean;
}

/** endKey を含む直近 days 日の日別装着時間 (古い順) */
export function dailySeries(intervals: Interval[], endKey: string, days: number, target: TargetSpec): DayPoint[] {
  const out: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = addDays(endKey, -i);
    const minutes = Math.floor(dayTotalMs(intervals, key) / MIN_MS);
    const t = targetOn(target, key);
    out.push({ dayKey: key, minutes, target: t, achieved: minutes >= t });
  }
  return out;
}

export interface WeekPoint {
  /** 週の初日 (日曜) */
  startKey: string;
  endKey: string;
  /** その週の1日あたり平均 (分)。今週は今日までの日数で割る */
  averageMinutes: number;
  achievedDays: number;
  days: number;
  /** 平均が目標以上か */
  achieved: boolean;
  target: number;
}

/** 直近 weeks 週 (日曜はじまり) の週平均 (古い順) */
export function weeklySeries(intervals: Interval[], todayKey: string, weeks: number, target: TargetSpec): WeekPoint[] {
  const thisSunday = addDays(todayKey, -weekdayOf(todayKey));
  const out: WeekPoint[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const start = addDays(thisSunday, -7 * w);
    const end = w === 0 ? todayKey : addDays(start, 6);
    const n = w === 0 ? weekdayOf(todayKey) + 1 : 7;
    const pts = dailySeries(intervals, end, n, target);
    const total = pts.reduce((a, p) => a + p.minutes, 0);
    const avg = Math.round(total / n);
    const t = targetOn(target, end);
    out.push({ startKey: start, endKey: end, averageMinutes: avg, achievedDays: pts.filter((p) => p.achieved).length, days: n, achieved: avg >= t, target: t });
  }
  return out;
}

export interface SeriesSummary {
  days: number;
  /** 記録のある日数 */
  recordedDays: number;
  achievedDays: number;
  ratePercent: number;
  /** 1日あたり平均 (分)。記録のない日も 0 として含める */
  averageMinutes: number;
  /** 記録のある日の中での最長・最短 */
  longest: DayPoint | null;
  shortest: DayPoint | null;
}

export function summarize(points: DayPoint[]): SeriesSummary {
  const recorded = points.filter((p) => p.minutes > 0);
  const achieved = points.filter((p) => p.achieved).length;
  const total = points.reduce((a, p) => a + p.minutes, 0);
  const by = (f: (a: DayPoint, b: DayPoint) => boolean) => recorded.reduce<DayPoint | null>((m, p) => (!m || f(p, m) ? p : m), null);
  return {
    days: points.length,
    recordedDays: recorded.length,
    achievedDays: achieved,
    ratePercent: points.length ? Math.round((achieved / points.length) * 100) : 0,
    averageMinutes: points.length ? Math.round(total / points.length) : 0,
    longest: by((a, b) => a.minutes > b.minutes),
    shortest: by((a, b) => a.minutes < b.minutes),
  };
}
