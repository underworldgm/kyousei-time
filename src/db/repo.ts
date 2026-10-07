/**
 * ローカル (IndexedDB) への読み書き。すべての書き込みは
 *   1. IndexedDB へ即保存 (同一トランザクションで同期キューにも追加)
 *   2. UI は liveQuery で即反映
 *   3. オンラインなら sync が別途クラウドへ送る
 * の順で動く。ネットワークには一切依存しない。
 */
import { db, getMeta, setMeta } from "./indexedDb";
import { uuid } from "../lib/id";
import { validateRange } from "../lib/validation";
import { dayKeyOf, withTargetChange } from "../lib/time";
import {
  DEFAULT_CHILD_ID,
  LOCAL_USER_ID,
  type AnyRecord,
  type Child,
  type Identity,
  type Profile,
  type Settings,
  type TableName,
  type WearSession,
} from "../types";

const EPOCH = new Date(0).toISOString();
export const DEFAULT_TARGET_MINUTES = 14 * 60;

type Listener = () => void;
const writeListeners = new Set<Listener>();
/** 書き込みがあったときに同期を促すためのフック (sync.ts が購読) */
export function onLocalWrite(fn: Listener): () => void {
  writeListeners.add(fn);
  return () => writeListeners.delete(fn);
}
function emitWrite() {
  writeListeners.forEach((fn) => fn());
}

const nowIso = (now = Date.now()) => new Date(now).toISOString();

// ---------------------------------------------------------------- identity / bootstrap

/**
 * ログアウト: 同期を止める。記録は端末に残し (オフラインで使い続けられる)、
 * 同じアカウントで再ログインすると未同期分も含めて同期を再開する。
 */
export async function markSignedOut(): Promise<void> {
  const cur = await getIdentity();
  if (!cur.authenticated) return;
  await setMeta("identity", { ...cur, authenticated: false } satisfies Identity);
  emitWrite();
}

export async function getIdentity(): Promise<Identity> {
  const saved = await getMeta<Identity>("identity");
  return saved ?? { userId: LOCAL_USER_ID, childId: DEFAULT_CHILD_ID, authenticated: false };
}

/**
 * 初回起動時に既定のプロフィール・子ども・設定を作る。
 * 既定値は updatedAt = 1970 の「未編集」扱いにして、別端末のクラウド上の本物のデータを上書きしない。
 */
export async function ensureBootstrap(): Promise<Identity> {
  const identity = await getIdentity();
  await db.transaction("rw", [db.profiles, db.children, db.settings, db.meta], async () => {
    if (!(await getMeta("identity"))) await setMeta("identity", identity);
    const { userId, childId } = identity;
    // 一度でもログインしたアカウントは (ログアウト中でも) ユーザーID基準の ID を使う
    const cloudIds = userId !== LOCAL_USER_ID;
    const profileId = cloudIds ? userId : "default-profile";
    if (!(await db.profiles.get(profileId))) {
      await db.profiles.put({ id: profileId, userId, displayName: "保護者", createdAt: EPOCH, updatedAt: EPOCH, syncStatus: "synced" });
    }
    if (!(await db.children.get(childId))) {
      await db.children.put({ id: childId, userId, name: "", icon: "🦷", createdAt: EPOCH, updatedAt: EPOCH, syncStatus: "synced" });
    }
    const settingsId = cloudIds ? childId : `settings-${childId}`;
    if (!(await db.settings.get(settingsId))) {
      await db.settings.put({
        id: settingsId,
        userId,
        childId,
        dailyTargetMinutes: DEFAULT_TARGET_MINUTES,
        notificationsEnabled: true,
        rewardStampEnabled: true,
        createdAt: EPOCH,
        updatedAt: EPOCH,
        syncStatus: "synced",
      });
    }
  });
  return identity;
}

/**
 * ログイン時: ローカルの local-user / default-child のデータを Supabase のユーザーに引き継ぐ。
 * 子どものIDはユーザーIDと同一にして、どの端末で初回ログインしても同じ「最初の子ども」に収束させる。
 * 別アカウントのデータが残っている場合は破棄してクラウドから取り直す。
 */
export interface AdoptResult {
  /** 別アカウントのローカルデータを破棄して切り替えた */
  switched: boolean;
  /** 前のアカウントに未同期の記録があるため切り替えなかった (データ保護) */
  blocked?: boolean;
}

let adopting: Promise<AdoptResult> | null = null;

/** 起動時の getSession と onAuthStateChange が同時に呼んでも1回ずつ順番に処理する */
export function adoptAuthUser(uid: string): Promise<AdoptResult> {
  const run = (adopting ?? Promise.resolve()).catch(() => undefined).then(() => adoptAuthUserInner(uid));
  adopting = run;
  return run;
}

async function adoptAuthUserInner(uid: string): Promise<AdoptResult> {
  const cur = await getIdentity();
  if (cur.authenticated && cur.userId === uid) return { switched: false };
  // ログアウト済みでも、以前ログインしていたアカウントのデータは「別アカウント」のもの
  const foreign = cur.userId !== LOCAL_USER_ID && cur.userId !== uid;
  if (foreign && (await db.outbox.count()) > 0) return { switched: false, blocked: true };
  const tables = [db.profiles, db.children, db.settings, db.sessions, db.outbox, db.meta];
  await db.transaction("rw", tables, async () => {
    if (foreign) {
      await Promise.all([db.profiles.clear(), db.children.clear(), db.settings.clear(), db.sessions.clear(), db.outbox.clear()]);
      const keep = await db.meta.get("identity");
      await db.meta.clear();
      if (keep) await db.meta.put(keep);
    }
    const oldChild = cur.childId;
    const newChild = uid;
    if (!foreign) {
      // 既存ローカルデータの付け替え
      const sessions = await db.sessions.where("childId").equals(oldChild).toArray();
      for (const s of sessions) {
        await db.sessions.put({ ...s, userId: uid, childId: newChild, syncStatus: "pending" });
        await enqueue("sessions", s.id);
      }
      const child = await db.children.get(oldChild);
      if (child) {
        await db.children.delete(oldChild);
        await db.children.put({ ...child, id: newChild, userId: uid, syncStatus: "pending" });
        await enqueue("children", newChild);
      }
      const st = await db.settings.where("childId").equals(oldChild).first();
      if (st) {
        await db.settings.delete(st.id);
        await db.settings.put({ ...st, id: newChild, userId: uid, childId: newChild, syncStatus: "pending" });
        await enqueue("settings", newChild);
      }
      const pr = await db.profiles.toCollection().first();
      if (pr) {
        await db.profiles.delete(pr.id);
        await db.profiles.put({ ...pr, id: uid, userId: uid, syncStatus: "pending" });
        await enqueue("profiles", uid);
      }
    }
    await setMeta("identity", { userId: uid, childId: newChild, authenticated: true } satisfies Identity);
  });
  await pruneOutbox();
  await ensureBootstrap();
  emitWrite();
  return { switched: foreign };
}

async function enqueue(table: TableName, recordId: string): Promise<void> {
  const key = `${table}:${recordId}`;
  const prev = await db.outbox.get(key);
  await db.outbox.put({ key, table, recordId, queuedAt: prev?.queuedAt ?? nowIso(), attempts: 0, lastError: null });
}

/** 古い (付け替え前の) キュー項目を除去し、存在しないレコードのキューを掃除する */
export async function pruneOutbox(): Promise<void> {
  const entries = await db.outbox.toArray();
  for (const e of entries) {
    const rec = await (db[e.table] as unknown as { get(id: string): Promise<AnyRecord | undefined> }).get(e.recordId);
    if (!rec) await db.outbox.delete(e.key);
  }
}

// ---------------------------------------------------------------- generic write

async function writeRecord<T extends AnyRecord>(table: TableName, rec: T): Promise<void> {
  await (db[table] as unknown as { put(r: T): Promise<unknown> }).put({ ...rec, syncStatus: "pending" });
  await enqueue(table, rec.id);
}

// ---------------------------------------------------------------- sessions

export type OpResult<T = WearSession> = { ok: true; session: T; warning?: string | null; discarded?: boolean } | { ok: false; error: string; session?: T };

/** 装着開始。すでに装着中なら新規作成せず既存セッションを返す (二重タップ・複数タブ対策)。 */
export async function startWear(now = Date.now()): Promise<OpResult> {
  const id = await getIdentity();
  const result = await db.transaction("rw", [db.sessions, db.outbox], async (): Promise<OpResult> => {
    const active = (await db.sessions.where("childId").equals(id.childId).toArray()).filter((s) => !s.endTime && !s.deletedAt);
    if (active.length) return { ok: false, error: "すでに装着中です", session: active[0] };
    const ts = nowIso(now);
    const session: WearSession = {
      id: uuid(),
      userId: id.userId,
      childId: id.childId,
      startTime: ts,
      endTime: null,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      syncStatus: "pending",
    };
    await writeRecord("sessions", session);
    return { ok: true, session };
  });
  if (result.ok) emitWrite();
  return result;
}

/** これより短い装着は押しまちがいとみなして記録しない */
export const MIN_DURATION_MS = 60_000;

/** 装着終了。複数の装着中セッションが (同期で) 存在する場合はすべて終了する。 */
export async function stopWear(now = Date.now()): Promise<OpResult | null> {
  const id = await getIdentity();
  const result = await db.transaction("rw", [db.sessions, db.outbox], async (): Promise<OpResult | null> => {
    const active = (await db.sessions.where("childId").equals(id.childId).toArray()).filter((s) => !s.endTime && !s.deletedAt);
    if (!active.length) return null;
    let last: WearSession = active[0];
    let discarded = false;
    for (const s of active) {
      const start = Date.parse(s.startTime);
      if (now - start < MIN_DURATION_MS) {
        // 開始直後の終了 (押しまちがい) は0分の記録を残さない。論理削除なので同期もされる
        last = { ...s, deletedAt: nowIso(now), updatedAt: nowIso(now) };
        discarded = true;
      } else {
        last = { ...s, endTime: nowIso(now), updatedAt: nowIso(now) };
      }
      await writeRecord("sessions", last);
    }
    return { ok: true, session: last, discarded: discarded && active.length === 1 };
  });
  if (result?.ok) emitWrite();
  return result;
}

export async function listSessions(): Promise<WearSession[]> {
  const id = await getIdentity();
  return (await db.sessions.where("childId").equals(id.childId).toArray()).filter((s) => !s.deletedAt);
}

/** 手動追加 */
export async function addSession(startMs: number, endMs: number, now = Date.now()): Promise<OpResult> {
  const id = await getIdentity();
  const others = await listSessions();
  const check = validateRange(startMs, endMs, now, others);
  if (!check.ok) return { ok: false, error: check.error };
  const ts = nowIso(now);
  const session: WearSession = {
    id: uuid(),
    userId: id.userId,
    childId: id.childId,
    startTime: nowIso(startMs),
    endTime: nowIso(endMs),
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    syncStatus: "pending",
  };
  await db.transaction("rw", [db.sessions, db.outbox], () => writeRecord("sessions", session));
  emitWrite();
  return { ok: true, session, warning: check.warning };
}

/** 開始・終了の修正。装着中のセッションは endMs = null のまま開始時刻だけ直せる。 */
export async function updateSession(sessionId: string, startMs: number, endMs: number | null, now = Date.now()): Promise<OpResult> {
  const existing = await db.sessions.get(sessionId);
  if (!existing || existing.deletedAt) return { ok: false, error: "記録が見つかりません" };
  const others = await listSessions();
  const check = validateRange(startMs, endMs, now, others, sessionId);
  if (!check.ok) return { ok: false, error: check.error };
  const next: WearSession = { ...existing, startTime: nowIso(startMs), endTime: endMs === null ? null : nowIso(endMs), updatedAt: nowIso(now) };
  await db.transaction("rw", [db.sessions, db.outbox], () => writeRecord("sessions", next));
  emitWrite();
  return { ok: true, session: next, warning: check.warning };
}

/** 論理削除 (deletedAt)。同期されるので他端末でも復活しない。 */
export async function deleteSession(sessionId: string, now = Date.now()): Promise<boolean> {
  const existing = await db.sessions.get(sessionId);
  if (!existing || existing.deletedAt) return false;
  const ts = nowIso(now);
  await db.transaction("rw", [db.sessions, db.outbox], () => writeRecord("sessions", { ...existing, deletedAt: ts, updatedAt: ts }));
  emitWrite();
  return true;
}

export interface ImportResult {
  added: number;
  /** 同じ記録がすでにある */
  duplicates: number;
  /** 既存の記録と重なる・不正な時刻 */
  skipped: number;
}

/**
 * CSV などから読み込んだ区間を装着記録として追加する。
 * 同じバックアップを2回読み込んでも重複しないよう、既存と重なるものは追加しない (既存データを優先)。
 */
export async function importIntervals(list: { start: number; end: number }[], now = Date.now()): Promise<ImportResult> {
  const id = await getIdentity();
  const result: ImportResult = { added: 0, duplicates: 0, skipped: 0 };
  await db.transaction("rw", [db.sessions, db.outbox], async () => {
    const existing = (await db.sessions.where("childId").equals(id.childId).toArray()).filter((s) => !s.deletedAt);
    for (const iv of list) {
      const same = existing.some((s) => Date.parse(s.startTime) === iv.start && s.endTime && Date.parse(s.endTime) === iv.end);
      if (same) {
        result.duplicates++;
        continue;
      }
      if (!validateRange(iv.start, iv.end, now, existing).ok) {
        result.skipped++;
        continue;
      }
      const ts = nowIso(now);
      const session: WearSession = {
        id: uuid(),
        userId: id.userId,
        childId: id.childId,
        startTime: nowIso(iv.start),
        endTime: nowIso(iv.end),
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
        syncStatus: "pending",
      };
      await writeRecord("sessions", session);
      existing.push(session);
      result.added++;
    }
  });
  if (result.added) emitWrite();
  return result;
}

// ---------------------------------------------------------------- settings / child

export async function saveSettings(
  patch: Partial<Pick<Settings, "dailyTargetMinutes" | "notificationsEnabled" | "rewardStampEnabled">>,
  now = Date.now(),
): Promise<Settings> {
  const id = await getIdentity();
  const cur = await getSettings(id);
  // 1〜24時間。内部は分単位なので30分刻みへの拡張も可能
  const minutes = Math.min(24 * 60, Math.max(60, Math.round(patch.dailyTargetMinutes ?? cur.dailyTargetMinutes)));
  const next: Settings = {
    ...cur,
    ...patch,
    dailyTargetMinutes: minutes,
    targetHistory: withTargetChange(cur.targetHistory, cur.dailyTargetMinutes, minutes, dayKeyOf(now)),
    createdAt: cur.createdAt === EPOCH ? nowIso(now) : cur.createdAt,
    updatedAt: nowIso(now),
  };
  await db.transaction("rw", [db.settings, db.outbox], () => writeRecord("settings", next));
  emitWrite();
  return next;
}

export async function getSettings(id?: Identity): Promise<Settings> {
  const ident = id ?? (await getIdentity());
  const found = await db.settings.where("childId").equals(ident.childId).first();
  if (found) return found;
  await ensureBootstrap();
  return (await db.settings.where("childId").equals(ident.childId).first())!;
}

export async function saveChild(patch: Partial<Pick<Child, "name" | "icon">>, now = Date.now()): Promise<void> {
  const id = await getIdentity();
  const cur = await db.children.get(id.childId);
  if (!cur) return;
  const next: Child = { ...cur, ...patch, createdAt: cur.createdAt === EPOCH ? nowIso(now) : cur.createdAt, updatedAt: nowIso(now) };
  await db.transaction("rw", [db.children, db.outbox], () => writeRecord("children", next));
  emitWrite();
}

export type { Profile };

// ---------------------------------------------------------------- dev sample data

/** 開発モード専用: カレンダー確認用のサンプル (同期対象外・本番ビルドでは呼び出し不可) */
export async function seedSampleData(todayKey: string): Promise<number> {
  if (!import.meta.env.DEV) return 0;
  const id = await getIdentity();
  const [y, m] = todayKey.split("-").map(Number);
  // [日, [開始,終了][]]
  const plan: Record<number, [string, string][]> = {
    1: [["07:30", "10:15"], ["11:10", "16:30"], ["17:15", "23:30"]], // 14:15 達成
    2: [["07:30", "12:00"], ["13:00", "21:40"]], // 13:10 未達成
    3: [["07:00", "22:00"]], // 15:00 達成
    4: [["08:00", "22:30"]],
    5: [["08:00", "20:00"]],
    6: [["06:30", "21:00"]],
  };
  const ids: string[] = [];
  const pad = (n: number) => String(n).padStart(2, "0");
  for (const [d, list] of Object.entries(plan)) {
    const key = `${y}-${pad(m)}-${pad(Number(d))}`;
    if (key >= todayKey) continue;
    for (const [s, e] of list) {
      const ts = nowIso();
      const rec: WearSession = {
        id: uuid(),
        userId: id.userId,
        childId: id.childId,
        startTime: nowIso(Date.parse(`${key}T${s}:00+09:00`)),
        endTime: nowIso(Date.parse(`${key}T${e}:00+09:00`)),
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
        syncStatus: "synced",
      };
      await db.sessions.put(rec);
      ids.push(rec.id);
    }
  }
  const prev = (await getMeta<string[]>("sampleIds")) ?? [];
  await setMeta("sampleIds", [...prev, ...ids]);
  return ids.length;
}

export async function clearSampleData(): Promise<void> {
  const ids = (await getMeta<string[]>("sampleIds")) ?? [];
  await db.sessions.bulkDelete(ids);
  await setMeta("sampleIds", []);
}
