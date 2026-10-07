import { describe, expect, it } from "vitest";
import {
  currentStreak, dayKeyOf, entriesOnDay, expectedGoalTime, fmtClockWithDay, fmtDuration, fromJst, intervalsOf, rangeStats,
  sessionsToCsv, splitByDay, summarizeDay, summarizeMonth,
} from "../src/lib/time";
import { validateRange } from "../src/lib/validation";
import type { WearSession } from "../src/types";

let n = 0;
const S = (day: string, s: string, e: string | null, endDay = day, extra: Partial<WearSession> = {}): WearSession => ({
  id: `s${n++}`, userId: "u", childId: "c",
  startTime: new Date(fromJst(day, s)).toISOString(),
  endTime: e ? new Date(fromJst(endDay, e)).toISOString() : null,
  createdAt: "", updatedAt: "", deletedAt: null, syncStatus: "synced", ...extra,
});
const T = 840;

describe("日付キー (Asia/Tokyo)", () => {
  it("UTC 15:00 は JST の翌日 00:00", () => {
    expect(dayKeyOf(Date.parse("2026-10-07T14:59:59Z"))).toBe("2026-10-07");
    expect(dayKeyOf(Date.parse("2026-10-07T15:00:00Z"))).toBe("2026-10-08");
  });
});

describe("1日の合計・残り", () => {
  const sessions = [S("2026-10-07", "08:00", "10:30"), S("2026-10-07", "12:00", "15:00"), S("2026-10-07", "18:00", "22:30")];
  const now = fromJst("2026-10-07", "23:00");
  const sum = summarizeDay(intervalsOf(sessions, now), "2026-10-07", T);
  it("複数セッションを合計 (150+180+270=600分)", () => {
    expect(sum.totalMinutes).toBe(600);
    expect(sum.remainingMinutes).toBe(240);
    expect(fmtDuration(sum.remainingMinutes)).toBe("4時間00分");
    expect(sum.achieved).toBe(false);
  });
  it("目標達成と超過分", () => {
    const s2 = [...sessions, S("2026-10-07", "22:40", "23:50")];
    const r = summarizeDay(intervalsOf(s2, fromJst("2026-10-07", "23:55")), "2026-10-07", T);
    expect(r.totalMinutes).toBe(670);
    const full = summarizeDay(intervalsOf([S("2026-10-07", "07:00", "22:00"), S("2026-10-07", "22:10", "22:55")], now), "2026-10-07", T);
    expect(full.totalMinutes).toBe(945);
    expect(full.achieved).toBe(true);
    expect(full.overMinutes).toBe(105);
    expect(full.remainingMinutes).toBe(0);
  });
  it("ちょうど目標で達成 / 1分足りないと未達成", () => {
    expect(summarizeDay(intervalsOf([S("2026-10-07", "08:00", "22:00")], now), "2026-10-07", T).achieved).toBe(true);
    expect(summarizeDay(intervalsOf([S("2026-10-07", "08:00", "21:59")], now), "2026-10-07", T).achieved).toBe(false);
  });
  it("論理削除は集計に含めない", () => {
    const d = [S("2026-10-07", "08:00", "10:30", "2026-10-07", { deletedAt: "x" })];
    expect(summarizeDay(intervalsOf(d, now), "2026-10-07", T).totalMinutes).toBe(0);
  });
  it("重複 (複数端末) は二重計上しない", () => {
    const d = [S("2026-10-07", "08:00", "10:30"), S("2026-10-07", "08:00", "10:30"), S("2026-10-07", "09:00", "11:00")];
    expect(summarizeDay(intervalsOf(d, now), "2026-10-07", T).totalMinutes).toBe(180);
  });
});

describe("装着中・終了予定", () => {
  it("5時間装着済み+18:00再装着 → 終了予定は翌03:00 (常に+14hではない)", () => {
    const sessions = [S("2026-10-07", "08:00", "13:00"), S("2026-10-07", "18:00", null)];
    const now = fromJst("2026-10-07", "18:00");
    const sum = summarizeDay(intervalsOf(sessions, now), "2026-10-07", T);
    expect(sum.totalMinutes).toBe(300);
    const end = expectedGoalTime(sum, now)!;
    expect(fmtClockWithDay(end, now)).toBe("翌03:00");
  });
  it("装着中の経過分は合計に含まれ、終了予定は時間が経っても変わらない", () => {
    const sessions = [S("2026-10-07", "08:00", "13:00"), S("2026-10-07", "18:00", null)];
    const a = fromJst("2026-10-07", "18:00");
    const b = fromJst("2026-10-07", "20:30");
    const ea = expectedGoalTime(summarizeDay(intervalsOf(sessions, a), "2026-10-07", T), a)!;
    const sb = summarizeDay(intervalsOf(sessions, b), "2026-10-07", T);
    expect(sb.totalMinutes).toBe(450);
    expect(expectedGoalTime(sb, b)).toBe(ea);
  });
  it("達成後は予定なし", () => {
    const now = fromJst("2026-10-07", "23:00");
    const sum = summarizeDay(intervalsOf([S("2026-10-07", "08:00", "22:30")], now), "2026-10-07", T);
    expect(expectedGoalTime(sum, now)).toBeNull();
  });
});

describe("日付またぎ", () => {
  const s = S("2026-10-07", "23:00", "02:00", "2026-10-08");
  it("23:00→翌02:00 は 1時間 + 2時間 に分割", () => {
    const iv = intervalsOf([s], fromJst("2026-10-08", "12:00"));
    expect(splitByDay(iv[0]).map((x) => [x.dayKey, x.ms / 60000])).toEqual([["2026-10-07", 60], ["2026-10-08", 120]]);
    expect(summarizeDay(iv, "2026-10-07", T).totalMinutes).toBe(60);
    expect(summarizeDay(iv, "2026-10-08", T).totalMinutes).toBe(120);
  });
  it("日別一覧には当日分だけ・継続フラグ付きで出る", () => {
    const now = fromJst("2026-10-08", "12:00");
    const d1 = entriesOnDay([s], "2026-10-07", now)[0];
    const d2 = entriesOnDay([s], "2026-10-08", now)[0];
    expect([d1.ms / 60000, d1.toNextDay, d1.fromPrevDay]).toEqual([60, true, false]);
    expect([d2.ms / 60000, d2.toNextDay, d2.fromPrevDay]).toEqual([120, false, true]);
  });
  it("日をまたいで装着中でも当日・翌日に分割される", () => {
    const act = S("2026-10-07", "23:00", null);
    const now = fromJst("2026-10-08", "01:00");
    const iv = intervalsOf([act], now);
    expect(summarizeDay(iv, "2026-10-08", T).totalMinutes).toBe(60);
  });
});

describe("カレンダー集計", () => {
  const sessions = [
    S("2026-10-01", "07:30", "10:15"), S("2026-10-01", "11:10", "16:30"), S("2026-10-01", "17:15", "23:30"), // 14:20
    S("2026-10-02", "07:30", "12:00"), S("2026-10-02", "13:00", "21:40"), // 13:10
    S("2026-10-03", "07:00", "22:00"), // 15:00
  ];
  const now = fromJst("2026-10-05", "12:00");
  const m = summarizeMonth(intervalsOf(sessions, now), 2026, 10, T, "2026-10-05");
  it("日ごとの分と達成判定", () => {
    expect(m.days[0].minutes).toBe(860);
    expect(m.days[0].status).toBe("achieved");
    expect(m.days[1].minutes).toBe(790);
    expect(m.days[1].status).toBe("partial");
    expect(m.days[2].status).toBe("achieved");
    expect(m.days[3].status).toBe("none");
    expect(m.days[5].status).toBe("future");
    expect(m.days[4].isToday).toBe(true);
  });
  it("達成日数 / 経過日数 / 達成率", () => {
    expect(m.achievedCount).toBe(2);
    expect(m.elapsedDays).toBe(5);
    expect(m.ratePercent).toBe(40);
  });
  it("連続達成: 今日未達成でも昨日までの連続を維持", () => {
    const sess = [S("2026-10-03", "07:00", "22:00"), S("2026-10-04", "07:00", "22:00")];
    const iv = intervalsOf(sess, now);
    expect(currentStreak(iv, T, "2026-10-05")).toBe(2);
    expect(currentStreak(iv, T, "2026-10-07")).toBe(0);
  });
  it("7日間・30日間の平均", () => {
    const r = rangeStats(intervalsOf(sessions, now), "2026-10-07", 7, T);
    expect(r.totalMinutes).toBe(860 + 790 + 900);
    expect(r.averageMinutes).toBe(Math.round((860 + 790 + 900) / 7));
    expect(r.achievedDays).toBe(2);
  });
});

describe("CSV", () => {
  it("日付またぎは日ごとに分割し、達成列は日合計で判定", () => {
    const csv = sessionsToCsv([S("2026-10-07", "08:00", "10:30"), S("2026-10-07", "23:00", "02:00", "2026-10-08")], T, fromJst("2026-10-09", "00:00"));
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("日付,開始時間,終了時間,装着時間,目標時間,達成");
    expect(lines[1]).toBe("2026-10-07,08:00,10:30,150,840,false");
    expect(lines).toContain("2026-10-07,23:00,24:00,60,840,false");
    expect(lines).toContain("2026-10-08,00:00,02:00,120,840,false");
  });
});

describe("入力検証", () => {
  const now = fromJst("2026-10-07", "12:00");
  const a = fromJst("2026-10-07", "08:00");
  it("終了 < 開始 は禁止", () => expect(validateRange(a, a - 1, now).ok).toBe(false));
  it("終了 = 開始 も禁止", () => expect(validateRange(a, a, now).ok).toBe(false));
  it("未来の時刻は禁止", () => expect(validateRange(a, now + 3600_000, now).ok).toBe(false));
  it("16時間超は警告つきで許可、24時間超は禁止", () => {
    const r = validateRange(now - 17 * 3600_000, now, now);
    expect(r.ok && r.warning).toBeTruthy();
    expect(validateRange(now - 25 * 3600_000, now, now).ok).toBe(false);
  });
  it("他の記録との重なりは禁止 (自分自身は除く)", () => {
    const other = S("2026-10-07", "09:00", "10:00", "2026-10-07", { id: "other" });
    expect(validateRange(a, fromJst("2026-10-07", "09:30"), now, [other]).ok).toBe(false);
    expect(validateRange(a, fromJst("2026-10-07", "09:00"), now, [other]).ok).toBe(true);
    expect(validateRange(fromJst("2026-10-07", "09:10"), fromJst("2026-10-07", "09:50"), now, [other], "other").ok).toBe(true);
  });
});
