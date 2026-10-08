import { useEffect, useState } from "react";

/**
 * 現在時刻。表示更新用であり、装着時間の「保持」には使わない
 * (計算は常に保存済み startTime と現在時刻の差分から行う)。
 * ロック解除・タブ復帰時にも即座に再取得する。
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, intervalMs);
    const onVis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", tick);
    window.addEventListener("pageshow", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", tick);
      window.removeEventListener("pageshow", tick);
    };
  }, [intervalMs]);
  return now;
}
