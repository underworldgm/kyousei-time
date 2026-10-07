/**
 * 時間計算 (すべて純粋関数)。
 * 日付の区切りは常に Asia/Tokyo (UTC+9, 夏時間なし) 基準。端末のタイムゾーンには依存しない。
 */
import type { WearSession } from "../types";

export const MIN_MS = 60_000;
export const HOUR_MS = 60 * MIN_MS;
export const DAY_MS = 24 * HOUR_MS;
export const JST_OFFSET_MS = 9 * HOUR_MS;

const pad = (n: number) => String(n).padStart(2, "0");

/** ms → "YYYY-MM-DD" (JST) */
export function dayKeyOf(ms: number): string {
  const d = new Date(ms + JST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** "YYYY-MM-DD" (JST) の 00:00 の ms */
export function dayStartMs(key: string): number {
  return Date.parse(`${key}T00:00:00+09:00`);
}

export function addDays(key: string, n: number): string {
  return dayKeyOf(dayStartMs(key) + n * DAY_MS);
}

/** JSTの日付キー + "HH:MM" → ms */
export function fromJst(dayKey: string, hm: string): number {
  return Date.parse(`${dayKey}T${hm}:00+09:00`);
}

export function jstHM(ms: number): string {
  const d = new Date(ms + JST_OFFSET_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function parseDayKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

/** 曜日 0=日 */
export function weekdayOf(key: string): number {
  return new Date(dayStartMs(key) + JST_OFFSET_MS).getUTCDay();
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthKey(y: number, m: number, d = 1): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

// ---------------------------------------------------------------- formatting

/** 150 → "2時間30分", 60 → "1時間00分", 45 → "45分" */
export function fmtDuration(minutes: number, opts: { short?: boolean } = {}): string {
  const m = Math.max(0, Math.floor(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}分`;
  return opts.short && r === 0 ? `${h}時間` : `${h}時間${pad(r)}分`;
}

/** 終了予定の表示。翌日以降なら "翌03:00" */
export function fmtClockWithDay(ms: number, baseMs: number): string {
  const diff = Math.round((dayStartMs(dayKeyOf(ms)) - dayStartMs(dayKeyOf(baseMs))) / DAY_MS);
  const hm = jstHM(ms);
  return diff <= 0 ? hm : diff === 1 ? `翌${hm}` : `${diff}日後 ${hm}`;
}

// ---------------------------------------------------------------- intervals

export interface Interval {
  start: number;
  end: number;
}

/** 論理削除されていない・妥当なセッションを区間にする。装着中 (endTime=null) は now まで。 */
export function sessionInterval(s: Pick<WearSession, "startTime" | "endTime" | "deletedAt">, now: number): Interval | null {
  if (s.deletedAt) return null;
  const start = Date.parse(s.startTime);
  const end = s.endTime ? Date.parse(s.endTime) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}

/**
 * 区間を結合して返す。複数端末で重複した記録が入っても二重計上しないための安全網。
 */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ ...iv });
  }
  return out;
}

export function intervalsOf(sessions: WearSession[], now: number): Interval[] {
  const list: Interval[] = [];
  for (const s of sessions) {
    const iv = sessionInterval(s, now);
    if (iv) list.push(iv);
  }
  return mergeIntervals(list);
}

function overlap(iv: Interval, from: number, to: number): number {
  return Math.max(0, Math.min(iv.end, to) - Math.max(iv.start, from));
}

/** その日 (JST 0:00-24:00) に含まれる装着時間 (ms)。日付またぎは自動で分割される。 */
export function dayTotalMs(intervals: Interval[], dayKey: string): number {
  const from = dayStartMs(dayKey);
  const to = from + DAY_MS;
  let sum = 0;
  for (const iv of intervals) {
    if (iv.start >= to) break;
    sum += overlap(iv, from, to);
  }
  return sum;
}

export interface DaySegment {
  dayKey: string;
  start: number;
  end: number;
  ms: number;
}

/** 1つの区間を日ごとに分割 (例: 23:00→翌02:00 → 1h + 2h) */
export function splitByDay(iv: Interval): DaySegment[] {
  const out: DaySegment[] = [];
  let cursor = iv.start;
  while (cursor < iv.end) {
    const key = dayKeyOf(cursor);
    const next = Math.min(dayStartMs(key) + DAY_MS, iv.end);
    out.push({ dayKey: key, start: cursor, end: next, ms: next - cursor });
    cursor = next;
  }
  return out;
}

export interface DayEntry {
  session: WearSession;
  /** その日に属する部分 */
  start: number;
  end: number;
  ms: number;
  active: boolean;
  fromPrevDay: boolean;
  toNextDay: boolean;
}

/** その日の装着履歴 (日付またぎは当日分に切り詰めて返す) */
export function entriesOnDay(sessions: WearSession[], dayKey: string, now: number): DayEntry[] {
  const from = dayStartMs(dayKey);
  const to = from + DAY_MS;
  const out: DayEntry[] = [];
  for (const s of sessions) {
    const iv = sessionInterval(s, now);
    if (!iv || iv.end <= from || iv.start >= to) continue;
    const start = Math.max(iv.start, from);
    const end = Math.min(iv.end, to);
    out.push({
      session: s,
      start,
      end,
      ms: end - start,
      active: !s.endTime && !s.deletedAt,
      fromPrevDay: iv.start < from,
      toNextDay: iv.end > to,
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------- day summary

export interface DaySummary {
  dayKey: string;
  totalMs: number;
  totalMinutes: number;
  targetMinutes: number;
  remainingMinutes: number;
  remainingMs: number;
  achieved: boolean;
  /** 目標超過分 (分) */
  overMinutes: number;
}

export function summarizeDay(intervals: Interval[], dayKey: string, targetMinutes: number): DaySummary {
  const totalMs = dayTotalMs(intervals, dayKey);
  const totalMinutes = Math.floor(totalMs / MIN_MS);
  const remainingMinutes = Math.max(targetMinutes - totalMinutes, 0);
  return {
    dayKey,
    totalMs,
    totalMinutes,
    targetMinutes,
    remainingMinutes,
    remainingMs: Math.max(targetMinutes * MIN_MS - totalMs, 0),
    achieved: totalMinutes >= targetMinutes,
    overMinutes: Math.max(totalMinutes - targetMinutes, 0),
  };
}

/**
 * 終了予定 (= 目標達成予定) 時刻。
 * 常に「開始 + 目標」ではなく「今 + その日の残り必要時間」。装着中の経過分は totalMs に含まれている。
 * 達成済みなら null。
 */
export function expectedGoalTime(summary: DaySummary, now: number): number | null {
  return summary.achieved ? null : now + summary.remainingMs;
}

// ---------------------------------------------------------------- calendar / stats

export type DayStatus = "achieved" | "partial" | "none" | "future";

export interface CalendarDay {
  dayKey: string;
  day: number;
  weekday: number;
  minutes: number;
  status: DayStatus;
  isToday: boolean;
}

export interface MonthSummary {
  year: number;
  month: number;
  days: CalendarDay[];
  achievedCount: number;
  /** 今日までに経過した日数 (今月) / 月の日数 (過去月) / 0 (未来月) */
  elapsedDays: number;
  ratePercent: number;
}

export function summarizeMonth(
  intervals: Interval[],
  year: number,
  month: number,
  targetMinutes: number,
  todayKey: string,
): MonthSummary {
  const n = daysInMonth(year, month);
  const days: CalendarDay[] = [];
  let achievedCount = 0;
  let elapsedDays = 0;
  for (let d = 1; d <= n; d++) {
    const key = monthKey(year, month, d);
    const future = key > todayKey;
    const minutes = future ? 0 : Math.floor(dayTotalMs(intervals, key) / MIN_MS);
    const status: DayStatus = future ? "future" : minutes >= targetMinutes ? "achieved" : minutes > 0 ? "partial" : "none";
    if (!future) elapsedDays++;
    if (status === "achieved") achievedCount++;
    days.push({ dayKey: key, day: d, weekday: weekdayOf(key), minutes, status, isToday: key === todayKey });
  }
  return {
    year,
    month,
    days,
    achievedCount,
    elapsedDays,
    ratePercent: elapsedDays ? Math.round((achievedCount / elapsedDays) * 100) : 0,
  };
}

/**
 * 連続達成日数。今日がまだ未達成でも、昨日までの連続は途切れ扱いにしない (プレッシャーを避ける)。
 */
export function currentStreak(intervals: Interval[], targetMinutes: number, todayKey: string, maxDays = 400): number {
  const ok = (key: string) => Math.floor(dayTotalMs(intervals, key) / MIN_MS) >= targetMinutes;
  let key = ok(todayKey) ? todayKey : addDays(todayKey, -1);
  let n = 0;
  while (n < maxDays && ok(key)) {
    n++;
    key = addDays(key, -1);
  }
  return n;
}

export interface RangeStats {
  days: number;
  totalMinutes: number;
  /** 1日あたりの平均 (分) */
  averageMinutes: number;
  achievedDays: number;
}

/** endKey を含む直近 days 日 (7日間 / 30日間など) の集計 */
export function rangeStats(intervals: Interval[], endKey: string, days: number, targetMinutes: number): RangeStats {
  let total = 0;
  let achieved = 0;
  for (let i = 0; i < days; i++) {
    const m = Math.floor(dayTotalMs(intervals, addDays(endKey, -i)) / MIN_MS);
    total += m;
    if (m >= targetMinutes) achieved++;
  }
  return { days, totalMinutes: total, averageMinutes: Math.round(total / days), achievedDays: achieved };
}

// ---------------------------------------------------------------- CSV

const csvCell = (v: string | number | boolean) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 日付,開始時間,終了時間,装着時間(分),目標時間(分),達成 。日付またぎは日ごとに1行へ分割。 */
export function sessionsToCsv(sessions: WearSession[], targetMinutes: number, now: number): string {
  const merged = intervalsOf(sessions, now);
  const rows: string[][] = [["日付", "開始時間", "終了時間", "装着時間", "目標時間", "達成"]];
  const segs: { key: string; start: number; end: number }[] = [];
  for (const s of sessions) {
    const iv = sessionInterval(s, now);
    if (!iv) continue;
    for (const seg of splitByDay(iv)) segs.push({ key: seg.dayKey, start: seg.start, end: seg.end });
  }
  segs.sort((a, b) => a.start - b.start);
  for (const seg of segs) {
    const minutes = Math.round((seg.end - seg.start) / MIN_MS);
    const dayTotal = Math.floor(dayTotalMs(merged, seg.key) / MIN_MS);
    const endHM = seg.end === dayStartMs(seg.key) + DAY_MS ? "24:00" : jstHM(seg.end);
    rows.push([seg.key, jstHM(seg.start), endHM, String(minutes), String(targetMinutes), String(dayTotal >= targetMinutes)]);
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
