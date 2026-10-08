/**
 * supabase/migrations を実際の PostgreSQL (PGlite) で実行し、
 * LWW トリガー・synced_at・制約・RLS を検証する。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { db as localDb } from "../src/db/indexedDb";
import { addSession, adoptAuthUser, ensureBootstrap, saveChild, saveSettings } from "../src/db/repo";
import { pushOutbox, pullAll, REMOTE_TABLE, type Remote, type RemoteRow } from "../src/lib/sync";
import type { TableName } from "../src/types";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const S1 = "11111111-1111-4111-8111-111111111111";
let db: PGlite;

async function as<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(uid ? `set role authenticated; set request.jwt.claim.sub = '${uid}';` : `set role anon; set request.jwt.claim.sub = '';`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub;");
  }
}

const upsertSession = (id: string, user: string, updated: string, end: string | null = "2026-10-07T01:30:00Z", deleted: string | null = null) =>
  db.query(
    `insert into public.wear_sessions (id, user_id, child_id, start_time, end_time, created_at, updated_at, deleted_at)
     values ($1, $2, $2, '2026-10-06T23:00:00Z', $3, $4, $4, $5)
     on conflict (id) do update set end_time = excluded.end_time, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
    [id, user, end, updated, deleted],
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(join(__dirname, "sql/supabase-stub.sql"), "utf8"));
  const dir = join(__dirname, "../supabase/migrations");
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));
  await db.query(`insert into auth.users (id) values ($1), ($2)`, [A, B]);
}, 30_000);

describe("Supabase migrations (PostgreSQL)", () => {
  it("全テーブルで RLS が有効", async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname in ('profiles','children','settings','wear_sessions')`,
    );
    expect(r.rows).toHaveLength(4);
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true);
  });

  it("LWW: 古い updated_at の更新は無視され、新しい更新は反映される", async () => {
    await as(A, () => upsertSession(S1, A, "2026-10-07T02:00:00Z"));
    await as(A, () => upsertSession(S1, A, "2026-10-07T01:00:00Z", "2026-10-07T05:00:00Z")); // 古い
    let r = await db.query<{ end_time: Date }>(`select end_time from public.wear_sessions where id = $1`, [S1]);
    expect(r.rows[0].end_time.toISOString()).toBe("2026-10-07T01:30:00.000Z");
    await as(A, () => upsertSession(S1, A, "2026-10-07T03:00:00Z", "2026-10-07T02:00:00Z")); // 新しい
    r = await db.query(`select end_time from public.wear_sessions where id = $1`, [S1]);
    expect(r.rows[0].end_time.toISOString()).toBe("2026-10-07T02:00:00.000Z");
  });

  it("論理削除は古い端末の更新で復活しない", async () => {
    await as(A, () => upsertSession(S1, A, "2026-10-07T04:00:00Z", "2026-10-07T02:00:00Z", "2026-10-07T04:00:00Z"));
    await as(A, () => upsertSession(S1, A, "2026-10-07T03:30:00Z", "2026-10-07T02:00:00Z", null));
    const r = await db.query<{ deleted_at: Date | null }>(`select deleted_at from public.wear_sessions where id = $1`, [S1]);
    expect(r.rows[0].deleted_at).not.toBeNull();
  });

  it("synced_at は更新のたびにサーバー時刻で進む (クライアント値は無視)", async () => {
    const before = await db.query<{ synced_at: Date }>(`select synced_at from public.wear_sessions where id = $1`, [S1]);
    await db.query(`select pg_sleep(0.01)`);
    await as(A, () =>
      db.query(`update public.wear_sessions set updated_at = '2026-10-07T05:00:00Z', synced_at = '2000-01-01' where id = $1`, [S1]),
    );
    const after = await db.query<{ synced_at: Date }>(`select synced_at from public.wear_sessions where id = $1`, [S1]);
    expect(after.rows[0].synced_at.getTime()).toBeGreaterThan(before.rows[0].synced_at.getTime());
  });

  it("RLS: 他人の行は読めず、書き換えもできない", async () => {
    const seen = await as(B, () => db.query(`select * from public.wear_sessions`));
    expect(seen.rows).toHaveLength(0);
    const upd = await as(B, () => db.query(`update public.wear_sessions set end_time = null where id = $1`, [S1]));
    expect(upd.affectedRows ?? 0).toBe(0);
    await expect(as(B, () => upsertSession("22222222-2222-4222-8222-222222222222", A, "2026-10-07T05:00:00Z"))).rejects.toThrow(/row-level security/);
  });

  it("RLS: anon (未ログイン) は何もできない", async () => {
    await expect(as(null, () => db.query(`select * from public.wear_sessions`))).rejects.toThrow(/permission denied/);
  });

  it("user_id の付け替えは禁止", async () => {
    await expect(db.query(`update public.wear_sessions set user_id = $1 where id = $2`, [B, S1])).rejects.toThrow(/immutable/);
  });

  it("終了 <= 開始 の記録は DB でも拒否", async () => {
    await expect(
      as(A, () =>
        db.query(
          `insert into public.wear_sessions (id, user_id, child_id, start_time, end_time, created_at, updated_at)
           values ('33333333-3333-4333-8333-333333333333', $1, $1, '2026-10-07T03:00:00Z', '2026-10-07T02:00:00Z', now(), now())`,
          [A],
        ),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("settings: target_history (jsonb) を保存・LWW で更新できる", async () => {
    const hist = JSON.stringify([{ from: "0000-01-01", minutes: 840 }, { from: "2026-10-05", minutes: 720 }]);
    await as(A, () =>
      db.query(
        `insert into public.settings (id, user_id, child_id, daily_target_minutes, notifications_enabled, reward_stamp_enabled, target_history, created_at, updated_at)
         values ($1, $1, $1, 720, true, true, $2::jsonb, now(), '2026-10-05T00:00:00Z')`,
        [A, hist],
      ),
    );
    const r = await as(A, () => db.query<{ target_history: unknown }>(`select target_history from public.settings where id = $1`, [A]));
    expect(r.rows[0].target_history).toEqual(JSON.parse(hist));
    await expect(as(A, () => db.query(`update public.settings set daily_target_minutes = 0 where id = $1`, [A]))).rejects.toThrow(/check constraint/);
  });
});

/** PGlite を Remote として使い、実際の同期処理 (push → pull) が DB スキーマと噛み合うか確認する */
function pgRemote(uid: string): Remote {
  return {
    async upsert(table: TableName, rows: RemoteRow[]) {
      for (const row of rows) {
        const cols = Object.keys(row);
        const vals = cols.map((c) => (row[c] !== null && typeof row[c] === "object" ? JSON.stringify(row[c]) : row[c]));
        const sql = `insert into public.${REMOTE_TABLE[table]} (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})
          on conflict (id) do update set ${cols.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(",")}`;
        await as(uid, () => db.query(sql, vals));
      }
    },
    async fetchSince(table: TableName, userId: string, since: string | null) {
      const r = await as(uid, () =>
        db.query<RemoteRow>(
          `select * from public.${REMOTE_TABLE[table]} where user_id = $1 and ($2::timestamptz is null or synced_at >= $2::timestamptz) order by synced_at limit 1000`,
          [userId, since],
        ),
      );
      // PostgREST と同じく timestamptz は "+00:00" 形式の文字列で返す
      const pg = (d: Date) => d.toISOString().replace("Z", "+00:00");
      return r.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Date ? pg(v) : v])));
    },
  };
}

describe("Web Push のテーブル", () => {
  it("送信予定・端末登録は本人だけが読み書きでき、子ども×種類で1行に上書きされる", async () => {
    const up = (uid: string, sendAt: string | null) =>
      as(uid, () =>
        db.query(
          `insert into public.push_schedules (user_id, child_id, kind, send_at, body, repeat_daily) values ($1, $1, 'reminder', $2, 'r', true)
           on conflict (child_id, kind) do update set send_at = excluded.send_at`,
          [uid, sendAt],
        ),
      );
    await up(A, "2026-10-07T11:00:00Z");
    await up(A, "2026-10-08T11:00:00Z");
    const mine = await as(A, () => db.query<{ send_at: Date }>(`select send_at from public.push_schedules`));
    expect(mine.rows).toHaveLength(1);
    expect(mine.rows[0].send_at.toISOString()).toBe("2026-10-08T11:00:00.000Z");
    expect((await as(B, () => db.query(`select * from public.push_schedules`))).rows).toHaveLength(0);
    await expect(
      as(B, () => db.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push/x', 'p', 'a')`, [A])),
    ).rejects.toThrow(/row-level security/);
    await as(A, () => db.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push/a', 'p', 'a')`, [A]));
    expect((await as(B, () => db.query(`delete from public.push_subscriptions`))).affectedRows ?? 0).toBe(0);
    expect((await as(A, () => db.query(`select * from public.push_subscriptions`))).rows).toHaveLength(1);
  });
});

describe("クライアント同期 ↔ 実スキーマ", () => {
  it("ログイン後の全レコードが送信でき、別端末で取得できる", async () => {
    await localDb.delete();
    await localDb.open();
    await ensureBootstrap();
    await addSession(Date.parse("2026-10-07T08:00:00+09:00"), Date.parse("2026-10-07T10:30:00+09:00"), Date.parse("2026-10-07T12:00:00+09:00"));
    await saveSettings({ dailyTargetMinutes: 720 });
    await saveChild({ name: "みな", icon: "🐰" });
    await adoptAuthUser(B);
    const remote = pgRemote(B);
    const r = await pushOutbox(remote);
    expect(r.error).toBeNull();
    expect(r.failed).toBe(0);
    expect(await localDb.outbox.count()).toBe(0);

    // 別端末 (空のローカル) で取得
    await localDb.delete();
    await localDb.open();
    await adoptAuthUser(B);
    await pullAll(remote, B);
    const sessions = await localDb.sessions.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].startTime).toBe("2026-10-06T23:00:00.000Z");
    const st = await localDb.settings.get(B);
    expect(st?.dailyTargetMinutes).toBe(720);
    expect(st?.targetHistory?.at(-1)?.minutes).toBe(720);
    expect((await localDb.children.get(B))?.name).toBe("みな");
  });
});
