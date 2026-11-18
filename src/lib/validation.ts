import type { WearSession } from "../types";
import { HOUR_MS, MIN_MS } from "./time";

export const LONG_SESSION_WARN_MS = 16 * HOUR_MS;
export const MAX_SESSION_MS = 24 * HOUR_MS;

export type RangeCheck =
  | { ok: true; warning: string | null }
  | { ok: false; error: string };

/**
 * 装着記録の妥当性確認。
 * @param endMs null の場合は装着中 (開始時刻のみ検証)
 */
export function validateRange(
  startMs: number,
  endMs: number | null,
  now: number,
  others: WearSession[] = [],
  selfId?: string,
): RangeCheck {
  if (!Number.isFinite(startMs)) return { ok: false, error: "開始時間を入力してください" };
  if (startMs > now + MIN_MS) return { ok: false, error: "開始時間が未来になっています" };
  if (endMs !== null) {
    if (!Number.isFinite(endMs)) return { ok: false, error: "終了時間を入力してください" };
    if (endMs <= startMs) return { ok: false, error: "終了時間は開始時間より後にしてください" };
    if (endMs > now + MIN_MS) return { ok: false, error: "終了時間が未来になっています" };
    if (endMs - startMs > MAX_SESSION_MS) return { ok: false, error: "1回の記録は24時間以内にしてください" };
  }
  const end = endMs ?? now;
  for (const o of others) {
    if (o.deletedAt || o.id === selfId) continue;
    const os = Date.parse(o.startTime);
    const oe = o.endTime ? Date.parse(o.endTime) : now;
    if (startMs < oe && end > os) return { ok: false, error: "ほかの装着記録と時間が重なっています" };
  }
  if (end - startMs > LONG_SESSION_WARN_MS) {
    return { ok: true, warning: "とても長い記録です (16時間以上)。まちがいではありませんか？" };
  }
  return { ok: true, warning: null };
}
