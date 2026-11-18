import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/indexedDb";
import { ensureBootstrap, getSettings, importIntervals, listSessions, saveSettings, startWear, stopWear } from "../src/db/repo";
import { parseSessionsCsv } from "../src/lib/csv";
import {
  currentStreak, dayKeyOf, fromJst, intervalsOf, sessionsToCsv, summarizeMonth, targetForDay, withTargetChange,
} from "../src/lib/time";
import type { WearSession } from "../src/types";

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureBootstrap();
});

let n = 0;
const S = (day: string, s: string, e: string, endDay = day): WearSession => ({
  id: `x${n++}`, userId: "u", childId: "c",
  startTime: new Date(fromJst(day, s)).toISOString(), endTime: new Date(fromJst(endDay, e)).toISOString(),
  createdAt: "", updatedAt: "", deletedAt: null, syncStatus: "synced",
});

describe("目標時間の履歴", () => {
  it("履歴なしなら現在の目標", () => expect(targetForDay(undefined, 840, "2026-10-01")).toBe(840));
  it("変更後も過去日は当時の目標で判定する", () => {
    const h = withTargetChange(undefined, 840, 720, "2026-10-05");
    expect(targetForDay(h, 720, "2026-10-04")).toBe(840);
    expect(targetForDay(h, 720, "2026-10-05")).toBe(720);
    expect(targetForDay(h, 720, "2026-10-30")).toBe(720);
    const h2 = withTargetChange(h, 720, 600, "2026-10-08");
    expect(targetForDay(h2, 600, "2026-10-06")).toBe(720);
    expect(targetForDay(h2, 600, "2026-10-08")).toBe(600);
  });
  it("同じ日に何度変えても履歴は1件、元に戻せば消える", () => {
    let h = withTargetChange(undefined, 840, 780, "2026-10-05");
    h = withTargetChange(h, 780, 720, "2026-10-05");
    expect(h).toEqual([{ from: "0000-01-01", minutes: 840 }, { from: "2026-10-05", minutes: 720 }]);
    h = withTargetChange(h, 720, 840, "2026-10-05");
    expect(h).toEqual([{ from: "0000-01-01", minutes: 840 }]);
    expect(withTargetChange(undefined, 840, 840, "2026-10-05")).toEqual([]);
  });
  it("カレンダー・連続達成が日ごとの目標を使う", () => {
    // 10/1-10/3 は 14h 目標で 13h 装着 (未達成)、10/4 から 12h 目標
    const h = withTargetChange(undefined, 840, 720, "2026-10-04");
    const tf = (k: string) => targetForDay(h, 720, k);
    const sessions = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"].map((d) => S(d, "08:00", "21:00"));
    const iv = intervalsOf(sessions, fromJst("2026-10-06", "12:00"));
    const m = summarizeMonth(iv, 2026, 10, tf, "2026-10-06");
    expect(m.days.slice(0, 5).map((d) => d.status)).toEqual(["partial", "partial", "partial", "achieved", "achieved"]);
    expect(currentStreak(iv, tf, "2026-10-06")).toBe(2);
  });
  it("saveSettings で履歴が保存される", async () => {
    await saveSettings({ dailyTargetMinutes: 720 }, fromJst("2026-10-05", "09:00"));
    const st = await getSettings();
    expect(st.targetHistory).toEqual([{ from: "0000-01-01", minutes: 840 }, { from: "2026-10-05", minutes: 720 }]);
    await saveSettings({ notificationsEnabled: false }, fromJst("2026-10-06", "09:00"));
    expect((await getSettings()).targetHistory).toHaveLength(2); // 目標が変わらなければ増えない
  });
});

describe("CSV 復元", () => {
  it("書き出し → 読み込みで同じ区間に戻る (日付またぎも1件に結合)", () => {
    const sessions = [S("2026-10-07", "08:00", "10:30"), S("2026-10-07", "23:00", "02:00", "2026-10-08"), S("2026-10-08", "12:00", "13:00")];
    const csv = sessionsToCsv(sessions, 840, fromJst("2026-10-09", "00:00"));
    const { intervals, invalidLines } = parseSessionsCsv(csv);
    expect(invalidLines).toEqual([]);
    expect(intervals).toEqual(intervalsOf(sessions, 0).map((x) => ({ start: x.start, end: x.end })));
    expect(intervals).toHaveLength(3);
  });
  it("手書きCSV: 終了 < 開始 は翌日扱い、不正な行は報告", () => {
    const { intervals, invalidLines } = parseSessionsCsv("日付,開始時間,終了時間\n2026-10-07,23:00,02:00\n2026-13-40,aa,bb\n\n2026-10-08,7:30,9:00\n");
    expect(intervals.map((i) => [dayKeyOf(i.start), (i.end - i.start) / 60000])).toEqual([["2026-10-07", 180], ["2026-10-08", 90]]);
    expect(invalidLines).toEqual([3]);
  });
  it("同じバックアップを2回読み込んでも重複しない", async () => {
    const list = [{ start: fromJst("2026-10-01", "08:00"), end: fromJst("2026-10-01", "10:00") }, { start: fromJst("2026-10-02", "08:00"), end: fromJst("2026-10-02", "10:00") }];
    const now = fromJst("2026-10-07", "12:00");
    expect(await importIntervals(list, now)).toEqual({ added: 2, duplicates: 0, skipped: 0 });
    expect(await importIntervals(list, now)).toEqual({ added: 0, duplicates: 2, skipped: 0 });
    expect(await importIntervals([{ start: fromJst("2026-10-01", "09:00"), end: fromJst("2026-10-01", "11:00") }], now)).toEqual({ added: 0, duplicates: 0, skipped: 1 });
    expect(await listSessions()).toHaveLength(2);
    expect(await db.outbox.count()).toBe(2); // 同期対象
  });
});

describe("押しまちがい", () => {
  it("1分未満で終了した装着は記録に残さない (論理削除)", async () => {
    const t = fromJst("2026-10-07", "08:00");
    await startWear(t);
    const r = await stopWear(t + 20_000);
    expect(r?.ok && r.discarded).toBe(true);
    expect(await listSessions()).toHaveLength(0);
    await startWear(t + 60_000);
    const r2 = await stopWear(t + 60_000 + 61_000);
    expect(r2?.ok && r2.discarded).toBe(false);
    expect(await listSessions()).toHaveLength(1);
  });
});

describe("通知の設定", () => {
  it("古いデータには既定値を補い、不正な時刻は保存しない", async () => {
    const { withSettingDefaults } = await import("../src/db/repo");
    const st = await getSettings();
    const { reminderEnabled, reminderTime, notificationSound, badgeEnabled, ...old } = withSettingDefaults(st);
    void reminderEnabled; void reminderTime; void notificationSound; void badgeEnabled;
    expect(withSettingDefaults(old as never)).toMatchObject({ reminderEnabled: false, reminderTime: "20:00", notificationSound: true, badgeEnabled: true });
    expect((await saveSettings({ reminderEnabled: true, reminderTime: "07:30" })).reminderTime).toBe("07:30");
    expect((await saveSettings({ reminderTime: "25:99" })).reminderTime).toBe("07:30");
  });
  it("目標は30分単位で保存できる", async () => {
    expect((await saveSettings({ dailyTargetMinutes: 870 })).dailyTargetMinutes).toBe(870);
  });
});

describe("Web Push の送信予定", () => {
  const base = {
    childId: "c1",
    childName: "みな",
    todayKey: "2026-10-07",
    targetMinutes: 840,
    notificationsEnabled: true,
    reminderEnabled: true,
    reminderTime: "20:00",
    notificationSound: true,
  };
  it("装着中は目標達成の時刻、外していれば取り消し", async () => {
    const { computePushSchedules } = await import("../src/lib/pushSchedule");
    const now = fromJst("2026-10-07", "18:00");
    const iv = intervalsOf([S("2026-10-07", "08:00", "13:00"), { ...S("2026-10-07", "18:00", "18:00"), endTime: null }], now);
    const [goal, rem] = computePushSchedules({ ...base, intervals: iv, wearing: true, now });
    expect(goal.sendAt).toBe(new Date(fromJst("2026-10-08", "03:00")).toISOString()); // 5時間済み → 翌03:00
    expect(goal.body).toContain("みなの");
    // 20:00 には未達成の見込み → 今日のリマインダーを送る
    expect(rem.sendAt).toBe(new Date(fromJst("2026-10-07", "20:00")).toISOString());
    expect(rem.repeatDaily).toBe(true);
    const off = computePushSchedules({ ...base, intervals: iv, wearing: false, now });
    expect(off[0].sendAt).toBeNull();
  });
  it("リマインダーの時刻までに届く見込み・達成済み・時刻を過ぎた → 明日", async () => {
    const { computePushSchedules } = await import("../src/lib/pushSchedule");
    const tomorrow = new Date(fromJst("2026-10-08", "20:00")).toISOString();
    const now = fromJst("2026-10-07", "19:00");
    const nearly = intervalsOf([S("2026-10-07", "05:00", "18:30"), { ...S("2026-10-07", "18:40", "18:40"), endTime: null }], now);
    expect(computePushSchedules({ ...base, intervals: nearly, wearing: true, now })[1].sendAt).toBe(tomorrow);
    const done = intervalsOf([S("2026-10-07", "04:00", "18:30")], now);
    expect(computePushSchedules({ ...base, intervals: done, wearing: false, now })[1].sendAt).toBe(tomorrow);
    const late = fromJst("2026-10-07", "21:00");
    expect(computePushSchedules({ ...base, intervals: [], wearing: false, now: late })[1].sendAt).toBe(tomorrow);
    expect(computePushSchedules({ ...base, reminderEnabled: false, intervals: [], wearing: false, now })[1].sendAt).toBeNull();
  });
  it("通知音なしの設定が silent に反映される", async () => {
    const { computePushSchedules } = await import("../src/lib/pushSchedule");
    const r = computePushSchedules({ ...base, notificationSound: false, intervals: [], wearing: false, now: fromJst("2026-10-07", "10:00") });
    expect(r.every((s) => s.silent)).toBe(true);
  });
});

describe("Web Push の送信処理 (Edge Function の中身)", () => {
  it("期限の来た予定を全端末へ送り、goal は取り消し・リマインダーは翌日へ、無効な端末は削除", async () => {
    const { runPush } = await import("../supabase/functions/send-push/core");
    const now = Date.parse("2026-10-07T11:00:30Z");
    const rows = [
      { user_id: "u", child_id: "c", kind: "goal" as const, send_at: "2026-10-07T11:00:00Z", title: "t", body: "b", silent: false, repeat_daily: false },
      { user_id: "u", child_id: "c", kind: "reminder" as const, send_at: "2026-10-07T11:00:00Z", title: "t", body: "r", silent: true, repeat_daily: true },
      { user_id: "u", child_id: "d", kind: "reminder" as const, send_at: "2026-10-06T23:00:00Z", title: "t", body: "old", silent: false, repeat_daily: true },
    ];
    const sent: string[] = [];
    const deleted: string[] = [];
    const marked: [string, string | null][] = [];
    const r = await runPush(
      {
        dueSchedules: async () => rows,
        subscriptionsFor: async () => [
          { id: "s1", user_id: "u", endpoint: "e1", p256dh: "p", auth: "a" },
          { id: "s2", user_id: "u", endpoint: "e2", p256dh: "p", auth: "a" },
        ],
        send: async (sub, payload) => {
          sent.push(`${sub.id}:${JSON.parse(payload).body}`);
          return sub.id === "s2" ? 410 : 201;
        },
        deleteSubscription: async (id) => void deleted.push(id),
        markSent: async (row, next) => void marked.push([`${row.child_id}-${row.kind}`, next]),
      },
      now,
    );
    expect(sent).toEqual(["s1:b", "s2:b", "s1:r", "s2:r"]); // 6時間以上前の古い予定は送らない
    expect(deleted).toEqual(["s2", "s2"]);
    expect(r).toMatchObject({ schedules: 3, sent: 2, removedSubscriptions: 2 });
    expect(marked).toEqual([
      ["c-goal", null],
      ["c-reminder", "2026-10-08T11:00:00.000Z"],
      ["d-reminder", "2026-10-07T23:00:00.000Z"],
    ]);
  });
});
