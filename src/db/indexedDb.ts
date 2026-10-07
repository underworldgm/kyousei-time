import Dexie, { type Table } from "dexie";
import type { Child, OutboxEntry, Profile, Settings, WearSession } from "../types";

export interface MetaRow {
  key: string;
  value: unknown;
}

export class KyouseiDB extends Dexie {
  profiles!: Table<Profile, string>;
  children!: Table<Child, string>;
  settings!: Table<Settings, string>;
  sessions!: Table<WearSession, string>;
  /** 同期キュー。レコード単位で1件にまとめる (key = table:id) */
  outbox!: Table<OutboxEntry, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = "kyousei-time") {
    super(name);
    this.version(1).stores({
      profiles: "id,userId",
      children: "id,userId",
      settings: "id,childId",
      sessions: "id,childId,startTime,endTime,syncStatus,deletedAt",
      outbox: "key,table",
      meta: "key",
    });
  }
}

export const db = new KyouseiDB();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
