import { useEffect, useRef, useState } from "react";
import { useAppData } from "../app/AppData";
import { DayRecords } from "../components/DayRecords";
import { Hero } from "../components/Hero";
import { Mascot } from "../components/Mascot";
import { Ring } from "../components/Ring";
import { Sparkle } from "../components/Sky";
import { startWear, stopWear } from "../db/repo";
import { useInstall } from "../hooks/useInstall";
import { currentStreak, expectedGoalTime, fmtClockWithDay, fmtDuration, jstHM, MIN_MS, summarizeDay } from "../lib/time";
import { LONG_SESSION_WARN_MS } from "../lib/validation";
import { permissionState } from "../lib/notifications";

export function TimerPage() {
  const { now, todayKey, intervals, sessions, active, targetMinutes, targetFor, settings, child } = useAppData();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const install = useInstall();

  const sum = summarizeDay(intervals, todayKey, targetMinutes);
  const wearing = !!active;
  const goalAt = expectedGoalTime(sum, now);
  const streak = currentStreak(intervals, targetFor, todayKey);
  const progress = targetMinutes ? sum.totalMs / (targetMinutes * MIN_MS) : 0;
  const elapsedMin = active ? Math.floor((now - Date.parse(active.startTime)) / MIN_MS) : 0;
  const longRunning = active ? now - Date.parse(active.startTime) > LONG_SESSION_WARN_MS : false;
  const notifyOn = !!settings?.notificationsEnabled;
  const perm = permissionState();

  // 目標達成の瞬間にだけ短い演出 (prefers-reduced-motion は CSS 側で無効化)
  const wasAchieved = useRef(sum.achieved);
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    if (sum.achieved && !wasAchieved.current) {
      setBurst(true);
      const t = setTimeout(() => setBurst(false), 3500);
      return () => clearTimeout(t);
    }
    wasAchieved.current = sum.achieved;
  }, [sum.achieved]);

  const toggle = async () => {
    if (busy) return; // 連打防止
    setBusy(true);
    setMsg(null);
    try {
      if (wearing) {
        const r = await stopWear();
        if (r?.ok && r.discarded) setMsg("1分未満だったので記録しませんでした");
      }
      else {
        const r = await startWear();
        if (!r.ok) setMsg(r.error);
      }
    } catch {
      setMsg("保存できませんでした。もう一度ためしてください。");
    } finally {
      setTimeout(() => setBusy(false), 900);
    }
  };

  const mood = sum.achieved ? "cheer" : "happy";

  return (
    <>
      <Hero childName={child?.name ?? ""} mood={mood} crown={sum.achieved}>
        <p className="goal-chip">
          <span aria-hidden="true">👑</span> 今日の目標 <strong>{fmtDuration(targetMinutes, { short: true })}</strong>
        </p>
      </Hero>

      <main className="page timer-page">
        <section className="ring-wrap" aria-label="今日の装着状況">
          <Ring progress={progress} achieved={sum.achieved}>
            <p className={`state-chip ${wearing ? "on" : "off"}`}>
              <span aria-hidden="true">{wearing ? "●" : "○"}</span> {wearing ? "装着中" : "外しています"}
            </p>
            {sum.achieved ? (
              <>
                <p className="ring-label">今日の目標達成！</p>
                <p className="ring-big done">よくできました！</p>
                {sum.overMinutes > 0 && <p className="ring-over">+{sum.overMinutes}分</p>}
              </>
            ) : (
              <>
                <p className="ring-label">のこり</p>
                <p className="ring-big" aria-live="off">
                  {fmtDuration(sum.remainingMinutes)}
                </p>
              </>
            )}
          </Ring>
          {burst && (
            <div className="burst" aria-hidden="true">
              {[...Array(10)].map((_, i) => (
                <Sparkle key={i} x={`${8 + ((i * 37) % 84)}%`} y={`${6 + ((i * 53) % 80)}%`} s={12 + (i % 3) * 5} color={["#ffd66b", "#ff9aa2", "#7fcaf5", "#5fd8c2"][i % 4]} delay={i * 0.08} />
              ))}
            </div>
          )}
        </section>

        <p className="today-total" aria-label="今日の装着時間">
          今日の装着 <strong>{fmtDuration(sum.totalMinutes)}</strong> / {fmtDuration(targetMinutes, { short: true })}
        </p>

        <section className={`card status-card ${wearing ? "on" : "off"}`} aria-label="現在の状態">
          <h2 className="status-title">
            <span aria-hidden="true">{wearing ? "●" : "○"}</span> 現在：{wearing ? "装着中" : "外しています"}
          </h2>
          {wearing && active ? (
            <dl className="kv">
              <div>
                <dt>開始時刻</dt>
                <dd>
                  {jstHM(Date.parse(active.startTime))}
                  <small>自動で記録しました</small>
                </dd>
              </div>
              <div>
                <dt>経過時間</dt>
                <dd>{fmtDuration(elapsedMin)}</dd>
              </div>
              <div>
                <dt>終了予定</dt>
                <dd>
                  {goalAt ? `${fmtClockWithDay(goalAt, now)}ごろ` : "達成ずみ"}
                  <small>目標時間から計算</small>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="status-note">
              {sum.achieved ? "今日の目標は達成ずみです。まだつける場合は、そのまま記録できます。" : goalAt ? `いま装着すると ${fmtClockWithDay(goalAt, now)}ごろ に目標達成できます。` : ""}
            </p>
          )}
          {longRunning && <p className="form-warn">⚠ 装着が16時間以上つづいています。外し忘れの場合は、下の記録から時刻を直せます。</p>}
          <p className="notify-note">
            <span aria-hidden="true">🔔</span>{" "}
            {notifyOn ? (perm === "granted" ? "終了時間になったら通知します" : perm === "denied" ? "通知がブラウザでブロックされています" : perm === "unsupported" ? "この端末では通知を使えません" : "通知の許可が必要です (設定画面)") : "通知はオフです"}
          </p>
        </section>

        {wearing && goalAt && (
          <section className="card mascot-card" aria-label="目標達成の予測">
            <Mascot size={52} />
            <p>
              このまま装着すると
              <br />
              <strong>{fmtClockWithDay(goalAt, now)}ごろ</strong>目標達成できます
            </p>
          </section>
        )}
        {sum.achieved && (
          <section className="card celebrate-card" aria-label="目標達成">
            <Mascot size={52} mood="cheer" crown />
            <p>
              <strong>よくできました！</strong>
              <br />
              今日の目標を達成しました{sum.overMinutes > 0 ? `（+${sum.overMinutes}分）` : ""}
            </p>
          </section>
        )}

        <button type="button" className={`btn-main ${wearing ? "stop" : "start"}`} onClick={toggle} disabled={busy} aria-pressed={wearing}>
          <span className="btn-glyph" aria-hidden="true">
            {wearing ? "■" : "▶"}
          </span>
          {wearing ? "装着終了" : "装着開始"}
        </button>
        {msg && (
          <p className="form-error" role="alert">
            ⚠ {msg}
          </p>
        )}

        <section className="records" aria-labelledby="records-title">
          <h2 id="records-title">今日の記録</h2>
          <DayRecords sessions={sessions} dayKey={todayKey} now={now} emptyText="まだ今日の記録はありません。「装着開始」を押してね。" />
        </section>

        <section className="card streak-card" aria-label="連続達成">
          <span className="streak-crown" aria-hidden="true">
            👑
          </span>
          <div>
            <p className="streak-label">連続達成</p>
            <p className="streak-n">{streak > 0 ? `${streak}日連続で達成中！` : "今日からスタート！"}</p>
          </div>
        </section>

        {install.kind && !install.dismissed && (
          <section className="card install-card" aria-label="ホーム画面に追加">
            <div>
              <h2>ホーム画面に追加</h2>
              {install.kind === "ios" ? <p>Safari の「共有」ボタン → 「ホーム画面に追加」で、アプリのように使えます。</p> : <p>アプリのように起動できて、オフラインでも使えます。</p>}
            </div>
            <div className="install-actions">
              {install.kind === "native" && (
                <button type="button" className="btn mint" onClick={() => void install.install()}>
                  追加
                </button>
              )}
              <button type="button" className="btn outline" onClick={install.dismiss}>
                あとで
              </button>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
