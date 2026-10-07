import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/indexedDb";
import {
  addSession, adoptAuthUser, deleteSession, ensureBootstrap, getIdentity, listSessions, markSignedOut, saveSettings, startWear, stopWear, updateSession,
} from "../src/db/repo";
import { syncOnce, toRemote, type Remote, type RemoteRow } from "../src/lib/sync";
import type { TableName } from "../src/types";

/** Supabase のトリガーと同じ挙動 (LWW・synced_at 付与) を持つ疑似サーバー */
class FakeServer implements Remote {
  tables: Record<TableName, Map<string, RemoteRow>> = { profiles: new Map(), children: new Map(), settings: new Map(), sessions: new Map() };
  online = true;
  clock = 1;
  upserts = 0;
  async upsert(table: TableName, rows: RemoteRow[]) {
    if (!this.online) throw new Error("Failed to fetch");
    for (const r of rows) {
      const old = this.tables[table].get(r.id as string);
      if (old && Date.parse(r.updated_at as string) < Date.parse(old.updated_at as string)) continue;
      this.tables[table].set(r.id as string, { ...r, synced_at: new Date(1_800_000_000_000 + this.clock++ * 1000).toISOString() });
      this.upserts++;
    }
  }
  async fetchSince(table: TableName, userId: string, since: string | null) {
    if (!this.online) throw new Error("Failed to fetch");
    return [...this.tables[table].values()]
      .filter((r) => r.user_id === userId && (!since || (r.synced_at as string) >= since))
      .sort((a, b) => (a.synced_at as string).localeCompare(b.synced_at as string));
  }
}

const T0 = Date.parse("2026-10-07T00:00:00+09:00");
const at = (hm: string) => Date.parse(`2026-10-07T${hm}:00+09:00`);
const UID = "11111111-1111-4111-8111-111111111111";

async function reset() {
  await db.delete();
  await db.open();
  await ensureBootstrap();
}
beforeEach(reset);

describe("オフライン保存", () => {
  it("装着開始→終了がネットなしで保存され、outbox に積まれる", async () => {
    const a = await startWear(at("08:00"));
    expect(a.ok).toBe(true);
    const b = await stopWear(at("10:30"));
    expect(b?.ok).toBe(true);
    const list = await listSessions();
    expect(list).toHaveLength(1);
    expect(list[0].endTime).not.toBeNull();
    expect(list[0].syncStatus).toBe("pending");
    expect(await db.outbox.count()).toBe(1); // 同一レコードの更新は1件にまとまる
  });

  it("装着中に重複して開始できない (連打・複数タブ)", async () => {
    const r = await Promise.all([startWear(at("08:00")), startWear(at("08:00")), startWear(at("08:00"))]);
    expect(r.filter((x) => x.ok)).toHaveLength(1);
    expect((await listSessions()).filter((s) => !s.endTime)).toHaveLength(1);
  });

  it("停止の連打でも壊れない", async () => {
    await startWear(at("08:00"));
    await Promise.all([stopWear(at("09:00")), stopWear(at("09:00"))]);
    const list = await listSessions();
    expect(list).toHaveLength(1);
    expect(Date.parse(list[0].endTime!)).toBeGreaterThan(Date.parse(list[0].startTime));
  });

  it("不正な手動追加は保存されない / 修正・削除は論理削除", async () => {
    expect((await addSession(at("10:00"), at("09:00"), at("12:00"))).ok).toBe(false);
    expect((await listSessions()).length).toBe(0);
    const ok = await addSession(at("08:00"), at("10:30"), at("12:00"));
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect((await updateSession(ok.session.id, at("08:15"), at("10:45"), at("12:00"))).ok).toBe(true);
    expect((await listSessions())[0].startTime).toBe(new Date(at("08:15")).toISOString());
    expect(await deleteSession(ok.session.id, at("12:00"))).toBe(true);
    expect(await listSessions()).toHaveLength(0);
    const raw = await db.sessions.get(ok.session.id);
    expect(raw?.deletedAt).toBeTruthy(); // 物理削除ではない
  });

  it("設定: 1〜24時間にクランプ・分単位で保存", async () => {
    expect((await saveSettings({ dailyTargetMinutes: 0 })).dailyTargetMinutes).toBe(60);
    expect((await saveSettings({ dailyTargetMinutes: 99999 })).dailyTargetMinutes).toBe(1440);
    expect((await saveSettings({ dailyTargetMinutes: 810 })).dailyTargetMinutes).toBe(810);
  });
});

describe("オンライン復帰 → キュー同期", () => {
  it("未ログインの既定データは送らない → ログイン後にまとめて同期される", async () => {
    await startWear(at("08:00"));
    await stopWear(at("10:30"));
    await adoptAuthUser(UID);
    const server = new FakeServer();
    const r = await syncOnce(server, UID);
    expect(r.ok).toBe(true);
    expect(server.tables.sessions.size).toBe(1);
    const row = [...server.tables.sessions.values()][0];
    expect(row.user_id).toBe(UID);
    expect(row.child_id).toBe(UID);
    expect(row).not.toHaveProperty("sync_status");
    expect(await db.outbox.count()).toBe(0);
    expect((await listSessions())[0].syncStatus).toBe("synced");
  });

  it("オフライン中の操作はキューに残り、復帰後に送信される", async () => {
    await adoptAuthUser(UID);
    const server = new FakeServer();
    server.online = false;
    await startWear(at("08:00"));
    await stopWear(at("09:00"));
    await addSession(at("12:00"), at("13:00"), at("14:00"));
    const fail = await syncOnce(server, UID);
    expect(fail.ok).toBe(false);
    expect(await db.outbox.count()).toBeGreaterThan(0);
    expect((await listSessions()).every((s) => s.syncStatus === "error" || s.syncStatus === "pending")).toBe(true);
    server.online = true; // online イベント相当
    const ok = await syncOnce(server, UID);
    expect(ok.ok).toBe(true);
    expect(server.tables.sessions.size).toBe(2);
    expect(await db.outbox.count()).toBe(0);
  });

  it("冪等: 同じキューを再送してもサーバーに重複行は作られない", async () => {
    await adoptAuthUser(UID);
    const server = new FakeServer();
    await addSession(at("08:00"), at("09:00"), at("10:00"));
    await syncOnce(server, UID);
    // 送信後に応答を失った状況を模擬: outbox を復元して再送
    const s = (await listSessions())[0];
    await db.outbox.put({ key: `sessions:${s.id}`, table: "sessions", recordId: s.id, queuedAt: "", attempts: 0, lastError: null });
    await syncOnce(server, UID);
    expect(server.tables.sessions.size).toBe(1);
  });

  it("送信中にローカル編集されたら pending のまま残る", async () => {
    await adoptAuthUser(UID);
    const r = await addSession(at("08:00"), at("09:00"), at("10:00"));
    if (!r.ok) throw new Error();
    const server = new FakeServer();
    const orig = server.upsert.bind(server);
    server.upsert = async (t, rows) => {
      await orig(t, rows);
      if (t === "sessions") await updateSession(r.session.id, at("08:00"), at("09:30"), at("11:00"));
    };
    await syncOnce(server, UID);
    expect((await db.sessions.get(r.session.id))?.syncStatus).toBe("pending");
    expect(await db.outbox.count()).toBe(1);
  });
});

describe("複数端末", () => {
  it("2台の記録がマージされる (別レコードとして保持)", async () => {
    await adoptAuthUser(UID);
    const server = new FakeServer();
    await addSession(at("08:00"), at("09:00"), at("20:00"));
    await syncOnce(server, UID);
    // 端末B: 別のIndexedDB相当 → 同じサーバー行を直接追加
    const other = { ...toRemote((await listSessions())[0]), id: "22222222-2222-4222-8222-222222222222", start_time: new Date(at("12:00")).toISOString(), end_time: new Date(at("13:00")).toISOString() };
    await server.upsert("sessions", [other]);
    await syncOnce(server, UID);
    expect(await listSessions()).toHaveLength(2);
  });

  it("他端末での削除は復活しない (論理削除の LWW)", async () => {
    await adoptAuthUser(UID);
    const server = new FakeServer();
    const r = await addSession(at("08:00"), at("09:00"), at("10:00"));
    if (!r.ok) throw new Error();
    await syncOnce(server, UID);
    // 他端末が削除
    const row = server.tables.sessions.get(r.session.id)!;
    await server.upsert("sessions", [{ ...row, deleted_at: new Date(at("11:00")).toISOString(), updated_at: new Date(at("11:00")).toISOString() }]);
    await syncOnce(server, UID);
    expect(await listSessions()).toHaveLength(0);
    await syncOnce(server, UID); // 再同期しても復活しない
    expect(await listSessions()).toHaveLength(0);
    expect(server.tables.sessions.get(r.session.id)!.deleted_at).toBeTruthy();
  });

  it("LWW: 新しいローカル編集がクラウドの古い値に負けない / 古いローカルは負ける", async () => {
    await adoptAuthUser(UID);
    const server = new FakeServer();
    const r = await addSession(at("08:00"), at("09:00"), at("10:00"));
    if (!r.ok) throw new Error();
    await syncOnce(server, UID);
    const id = r.session.id;
    // クラウドが新しい (他端末で 09:30 に修正)
    const row = server.tables.sessions.get(id)!;
    await server.upsert("sessions", [{ ...row, end_time: new Date(at("09:30")).toISOString(), updated_at: new Date(Date.now() + 5000).toISOString() }]);
    await syncOnce(server, UID);
    expect((await db.sessions.get(id))!.endTime).toBe(new Date(at("09:30")).toISOString());
    // ローカルがさらに新しい編集 → サーバーへ反映
    await updateSession(id, at("08:00"), at("09:45"), Date.now() + 10_000);
    await syncOnce(server, UID);
    expect(server.tables.sessions.get(id)!.end_time).toBe(new Date(at("09:45")).toISOString());
  });

  it("新端末の未編集デフォルト設定が、クラウドの保存済み設定を上書きしない", async () => {
    await adoptAuthUser(UID);
    const server = new FakeServer();
    await saveSettings({ dailyTargetMinutes: 600 });
    await syncOnce(server, UID);
    await reset(); // 新しい端末
    await adoptAuthUser(UID);
    await syncOnce(server, UID);
    const st = await db.settings.get(UID);
    expect(st?.dailyTargetMinutes).toBe(600);
    expect(server.tables.settings.get(UID)!.daily_target_minutes).toBe(600);
  });

  it("別アカウント: 同期済みなら前のデータを破棄して切り替え、未同期があれば切り替えない", async () => {
    const OTHER = "33333333-3333-4333-8333-333333333333";
    await adoptAuthUser(UID);
    await addSession(at("08:00"), at("09:00"), at("10:00"));
    // 未同期の記録がある → データ保護のため切り替えない
    expect(await adoptAuthUser(OTHER)).toEqual({ switched: false, blocked: true });
    expect(await listSessions()).toHaveLength(1);
    expect((await getIdentity()).userId).toBe(UID);
    // 同期が済めば切り替えられる
    await syncOnce(new FakeServer(), UID);
    const r = await adoptAuthUser(OTHER);
    expect(r.switched).toBe(true);
    expect(await listSessions()).toHaveLength(0);
    expect((await getIdentity()).userId).toBe(OTHER);
  });

  it("ログアウト後に別アカウントでログインしても、前のアカウントの記録は移らない", async () => {
    const OTHER = "44444444-4444-4444-8444-444444444444";
    const server = new FakeServer();
    await adoptAuthUser(UID);
    await addSession(at("08:00"), at("09:00"), at("10:00"));
    await syncOnce(server, UID);
    await markSignedOut();
    expect((await getIdentity()).authenticated).toBe(false);
    await adoptAuthUser(OTHER);
    await syncOnce(server, OTHER);
    expect(await listSessions()).toHaveLength(0);
    expect([...server.tables.sessions.values()].every((r) => r.user_id === UID)).toBe(true);
  });

  it("ログアウト中の記録は端末に残り、同じアカウントで再ログインすると同期される", async () => {
    const server = new FakeServer();
    await adoptAuthUser(UID);
    await syncOnce(server, UID);
    await markSignedOut();
    await ensureBootstrap(); // ログアウト後のアプリ再起動
    expect(await db.settings.count()).toBe(1);
    expect(await db.profiles.count()).toBe(1);
    await addSession(at("08:00"), at("09:00"), at("10:00")); // ログアウト中 (オフライン利用)
    expect(server.tables.sessions.size).toBe(0);
    const r = await adoptAuthUser(UID);
    expect(r).toEqual({ switched: false });
    await syncOnce(server, UID);
    expect(server.tables.sessions.size).toBe(1);
    expect([...server.tables.sessions.values()][0].user_id).toBe(UID);
  });

  it("ログイン処理が同時に2回呼ばれても記録は重複・消失しない", async () => {
    await addSession(at("08:00"), at("09:00"), at("10:00"));
    await addSession(at("11:00"), at("12:00"), at("13:00"));
    await Promise.all([adoptAuthUser(UID), adoptAuthUser(UID), adoptAuthUser(UID)]);
    const list = await listSessions();
    expect(list).toHaveLength(2);
    expect(list.every((s) => s.userId === UID && s.childId === UID)).toBe(true);
    expect(await db.children.count()).toBe(1);
    expect(await db.settings.count()).toBe(1);
  });
});

void T0;
