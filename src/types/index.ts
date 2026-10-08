export type SyncStatus = "synced" | "pending" | "syncing" | "error";

/** ローカル専用フィールド (Supabase には送らない) */
export interface LocalMeta {
  syncStatus: SyncStatus;
}

export interface Profile extends LocalMeta {
  id: string;
  userId: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface Child extends LocalMeta {
  id: string;
  userId: string;
  name: string;
  /** 絵文字などのアイコン */
  icon: string;
  createdAt: string;
  updatedAt: string;
}

export interface Settings extends LocalMeta {
  id: string;
  userId: string;
  childId: string;
  /** 1日の目標装着時間 (分)。14時間 = 840 */
  dailyTargetMinutes: number;
  /** 目標変更の履歴 (過去日の達成判定を当時の目標で行う)。古いデータでは未定義のことがある */
  targetHistory?: { from: string; minutes: number }[];
  /** 目標達成 (= 終了予定時刻) の通知 */
  notificationsEnabled: boolean;
  rewardStampEnabled: boolean;
  /** 毎日のリマインダー通知 (未達成のときだけ) */
  reminderEnabled?: boolean;
  /** "HH:MM" (JST) */
  reminderTime?: string;
  /** 通知音を鳴らす (false なら静かな通知) */
  notificationSound?: boolean;
  /** 未達成のときアプリのアイコンにしるし (Badge API 対応環境のみ) */
  badgeEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 1回の装着 = 1レコード。装着中は endTime = null。削除は deletedAt による論理削除。 */
export interface WearSession extends LocalMeta {
  id: string;
  userId: string;
  childId: string;
  startTime: string;
  endTime: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type TableName = "profiles" | "children" | "settings" | "sessions";
export type AnyRecord = Profile | Child | Settings | WearSession;

export interface OutboxEntry {
  /** `${table}:${recordId}` — 同一レコードの更新は1件にまとめる */
  key: string;
  table: TableName;
  recordId: string;
  queuedAt: string;
  attempts: number;
  lastError: string | null;
}

export interface Identity {
  userId: string;
  childId: string;
  /** Supabase Auth でログイン済みか */
  authenticated: boolean;
}

export const LOCAL_USER_ID = "local-user";
export const DEFAULT_CHILD_ID = "default-child";
