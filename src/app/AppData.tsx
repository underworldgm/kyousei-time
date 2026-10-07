import { createContext, useContext, useMemo, type ReactNode } from "react";
import { db } from "../db/indexedDb";
import { getIdentity } from "../db/repo";
import { useLive } from "../hooks/useLive";
import { useNow } from "../hooks/useNow";
import type { Child, Identity, Settings, WearSession } from "../types";
import { dayKeyOf, intervalsOf, targetForDay, type Interval } from "../lib/time";

interface Snapshot {
  identity: Identity;
  child: Child | null;
  settings: Settings | null;
  sessions: WearSession[];
}

export interface AppData extends Snapshot {
  loaded: boolean;
  error: Error | null;
  now: number;
  todayKey: string;
  active: WearSession | null;
  intervals: Interval[];
  /** 今日の目標 (分) */
  targetMinutes: number;
  /** その日に有効だった目標 (分)。過去日の達成判定に使う */
  targetFor: (dayKey: string) => number;
}

const EMPTY: Snapshot = { identity: { userId: "local-user", childId: "default-child", authenticated: false }, child: null, settings: null, sessions: [] };

async function loadSnapshot(): Promise<Snapshot> {
  const identity = await getIdentity();
  const [child, settings, all] = await Promise.all([
    db.children.get(identity.childId),
    db.settings.where("childId").equals(identity.childId).first(),
    db.sessions.where("childId").equals(identity.childId).toArray(),
  ]);
  return { identity, child: child ?? null, settings: settings ?? null, sessions: all.filter((s) => !s.deletedAt) };
}

const Ctx = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { value, error, loaded } = useLive(loadSnapshot, EMPTY);
  const active = useMemo(() => value.sessions.filter((s) => !s.endTime).sort((a, b) => a.startTime.localeCompare(b.startTime))[0] ?? null, [value.sessions]);
  // 装着中は秒表示のため毎秒、そうでなければ15秒ごと (+画面復帰時) に更新
  const now = useNow(active ? 1000 : 15000);
  const targetFor = useMemo(() => {
    const st = value.settings;
    const current = st?.dailyTargetMinutes ?? 840;
    return (key: string) => targetForDay(st?.targetHistory, current, key);
  }, [value.settings]);
  const data = useMemo<AppData>(() => {
    const todayKey = dayKeyOf(now);
    return {
      ...value,
      loaded,
      error,
      now,
      todayKey,
      active,
      intervals: intervalsOf(value.sessions, now),
      targetMinutes: targetFor(todayKey),
      targetFor,
    };
  }, [value, loaded, error, now, active, targetFor]);
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}

export function useAppData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error("AppDataProvider がありません");
  return v;
}
