/**
 * 同期エンジン (オフラインファースト)
 *
 *   ユーザー操作 → IndexedDB 即保存 (+ outbox へ追加) → UI 即反映 → オンラインなら push → pull
 *
 * - outbox はレコード単位 (table:id) で1件。送信成功後に updatedAt が変わっていなければ削除。
 *   途中でブラウザが終了しても outbox が残るので、次回起動時に再送される (upsert なので冪等)。
 * - 競合解決は Last Write Wins (updatedAt)。サーバー側トリガーでも古い更新は無視する。
 * - 削除は deletedAt の論理削除なので、他端末で復活しない。
 */
import { db, getMeta, setMeta } from "../db/indexedDb";
import { getIdentity, onLocalWrite, pruneOutbox } from "../db/repo";
import type { AnyRecord, TableName } from "../types";

export const TABLE_ORDER: TableName[] = ["profiles", "children", "settings", "sessions"];

/** DB テーブル名 (Supabase) */
export const REMOTE_TABLE: Record<TableName, string> = {
  profiles: "profiles",
  children: "children",
  settings: "settings",
  sessions: "wear_sessions",
};

export type RemoteRow = Record<string, unknown>;

export interface Remote {
  upsert(table: TableName, rows: RemoteRow[]): Promise<void>;
  /** syncedAt (サーバー時刻) が since より新しい行を返す */
  fetchSince(table: TableName, userId: string, since: string | null): Promise<RemoteRow[]>;
}

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export function toRemote(rec: AnyRecord): RemoteRow {
  const out: RemoteRow = {};
  for (const [k, v] of Object.entries(rec)) {
    if (k === "syncStatus") continue; // ローカル専用
    out[snake(k)] = v;
  }
  return out;
}

export function fromRemote(row: RemoteRow): AnyRecord & { syncedAt?: string } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[camel(k)] = v;
  out.syncStatus = "synced";
  return out as unknown as AnyRecord & { syncedAt?: string };
}

// ---------------------------------------------------------------- state store

export type SyncPhase = "local" | "signed-out" | "offline" | "idle" | "syncing" | "error";

export interface SyncState {
  phase: SyncPhase;
  online: boolean;
  pending: number;
  lastSyncedAt: string | null;
  error: string | null;
}

let state: SyncState = {
  phase: "local",
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  pending: 0,
  lastSyncedAt: null,
  error: null,
};
const subs = new Set<() => void>();
export const getSyncState = () => state;
export function subscribeSync(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}

// ---------------------------------------------------------------- core

const BATCH = 100;

async function getRecord(table: TableName, id: string): Promise<AnyRecord | undefined> {
  return (db[table] as unknown as { get(id: string): Promise<AnyRecord | undefined> }).get(id);
}

/** outbox を Supabase へ送る。失敗したレコードは outbox に残す。 */
export async function pushOutbox(remote: Remote): Promise<{ pushed: number; failed: number; error: string | null }> {
  await pruneOutbox();
  let pushed = 0;
  let failed = 0;
  let error: string | null = null;
  for (const table of TABLE_ORDER) {
    const entries = await db.outbox.where("table").equals(table).toArray();
    for (let i = 0; i < entries.length; i += BATCH) {
      const chunk = entries.slice(i, i + BATCH);
      const recs: AnyRecord[] = [];
      for (const e of chunk) {
        const r = await getRecord(table, e.recordId);
        if (r) recs.push(r);
      }
      if (!recs.length) continue;
      try {
        await remote.upsert(table, recs.map(toRemote));
        await db.transaction("rw", [db[table] as never, db.outbox], async () => {
          for (const sent of recs) {
            const latest = await getRecord(table, sent.id);
            // 送信中にローカルで更に編集されていたら pending のまま残す
            if (latest && latest.updatedAt === sent.updatedAt) {
              await (db[table] as unknown as { put(r: AnyRecord): Promise<unknown> }).put({ ...latest, syncStatus: "synced" });
              await db.outbox.delete(`${table}:${sent.id}`);
            }
          }
        });
        pushed += recs.length;
      } catch (e) {
        failed += recs.length;
        error = e instanceof Error ? e.message : String(e);
        await db.transaction("rw", [db[table] as never, db.outbox], async () => {
          for (const sent of recs) {
            const ent = await db.outbox.get(`${table}:${sent.id}`);
            if (ent) await db.outbox.put({ ...ent, attempts: ent.attempts + 1, lastError: error });
            const latest = await getRecord(table, sent.id);
            if (latest) await (db[table] as unknown as { put(r: AnyRecord): Promise<unknown> }).put({ ...latest, syncStatus: "error" });
          }
        });
      }
    }
  }
  return { pushed, failed, error };
}

/** クラウドの最新データを取り込む (LWW) */
export async function pullAll(remote: Remote, userId: string): Promise<number> {
  let applied = 0;
  for (const table of TABLE_ORDER) {
    const cursorKey = `cursor:${userId}:${table}`;
    let since = (await getMeta<string>(cursorKey)) ?? null;
    for (let guard = 0; guard < 100; guard++) {
      const rows = await remote.fetchSince(table, userId, since);
      if (!rows.length) break;
      let maxSynced = since;
      await db.transaction("rw", [db[table] as never, db.outbox], async () => {
        for (const row of rows) {
          const incoming = fromRemote(row);
          const { syncedAt, ...rec } = incoming as AnyRecord & { syncedAt?: string };
          if (syncedAt && (!maxSynced || syncedAt > maxSynced)) maxSynced = syncedAt;
          const local = await getRecord(table, rec.id);
          if (!local || Date.parse(rec.updatedAt) > Date.parse(local.updatedAt)) {
            await (db[table] as unknown as { put(r: AnyRecord): Promise<unknown> }).put(rec as AnyRecord);
            await db.outbox.delete(`${table}:${rec.id}`); // クラウドの方が新しいので送信不要
            applied++;
          } else if (Date.parse(rec.updatedAt) === Date.parse(local.updatedAt) && local.syncStatus !== "pending") {
            await (db[table] as unknown as { put(r: AnyRecord): Promise<unknown> }).put({ ...local, syncStatus: "synced" });
          }
          // ローカルの方が新しい場合: outbox に残っているので次回 push で上書きされる
        }
      });
      if (!maxSynced || maxSynced === since) break;
      since = maxSynced;
      await setMeta(cursorKey, since);
      if (rows.length < 1000) break;
    }
  }
  return applied;
}

export interface SyncResult {
  ok: boolean;
  pushed: number;
  pulled: number;
  error: string | null;
}

/** push → pull を1回実行 */
export async function syncOnce(remote: Remote, userId: string): Promise<SyncResult> {
  const push = await pushOutbox(remote);
  if (push.failed) return { ok: false, pushed: push.pushed, pulled: 0, error: push.error };
  try {
    const pulled = await pullAll(remote, userId);
    return { ok: true, pushed: push.pushed, pulled, error: null };
  } catch (e) {
    return { ok: false, pushed: push.pushed, pulled: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------- runtime controller

let remoteImpl: Remote | null = null;
let running: Promise<void> | null = null;
let rerun = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

export function configureRemote(remote: Remote | null) {
  remoteImpl = remote;
  void refreshPending();
  if (!remote) setState({ phase: "local" });
  else requestSync(0);
}

async function refreshPending() {
  try {
    setState({ pending: await db.outbox.count() });
  } catch {
    /* IndexedDB が使えない場合は無視 */
  }
}

function idlePhase(): SyncPhase {
  if (!remoteImpl) return "local";
  if (!state.online) return "offline";
  return "idle";
}

/** 少し待ってから同期 (連続操作をまとめる) */
export function requestSync(delayMs = 400) {
  void refreshPending();
  if (!remoteImpl) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void runSync(), delayMs);
}

async function runSync(): Promise<void> {
  if (!remoteImpl) return;
  if (!state.online) {
    setState({ phase: "offline" });
    return;
  }
  if (running) {
    rerun = true;
    return;
  }
  running = (async () => {
    setState({ phase: "syncing", error: null });
    try {
      const ident = await getIdentity();
      if (!ident.authenticated) {
        setState({ phase: "signed-out" });
        return;
      }
      const r = await syncOnce(remoteImpl!, ident.userId);
      await refreshPending();
      if (r.ok) {
        const at = new Date().toISOString();
        await setMeta("lastSyncedAt", at).catch(() => undefined);
        setState({ phase: "idle", lastSyncedAt: at, error: null });
      } else {
        setState({ phase: "error", error: r.error });
        scheduleRetry();
      }
    } catch (e) {
      setState({ phase: "error", error: e instanceof Error ? e.message : String(e) });
      scheduleRetry();
    }
  })().finally(() => {
    running = null;
    if (rerun) {
      rerun = false;
      requestSync(200);
    }
  });
  return running;
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryMs = 5_000;
function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => requestSync(0), retryMs);
  retryMs = Math.min(retryMs * 2, 5 * 60_000);
}

/** アプリ起動時に1度だけ呼ぶ: online/offline・復帰・定期同期・ローカル書き込みを購読 */
export function startSyncRuntime() {
  if (started || typeof window === "undefined") return;
  started = true;
  void getMeta<string>("lastSyncedAt").then((v) => v && setState({ lastSyncedAt: v })).catch(() => undefined);
  window.addEventListener("online", () => {
    retryMs = 5_000;
    setState({ online: true, phase: idlePhase() });
    requestSync(0); // 復帰 → outbox 送信 → 最新取得
  });
  window.addEventListener("offline", () => setState({ online: false, phase: remoteImpl ? "offline" : "local" }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") requestSync(0);
  });
  setInterval(() => requestSync(0), 60_000);
  onLocalWrite(() => requestSync());
}

export function setSignedOut() {
  if (remoteImpl) setState({ phase: "signed-out" });
}
