import { useMemo, useState } from "react";
import { useAppData } from "../app/AppData";
import { DayRecords } from "../components/DayRecords";
import { Hero } from "../components/Hero";
import { Mascot } from "../components/Mascot";
import { currentStreak, fmtDuration, parseDayKey, summarizeDay, summarizeMonth, weekdayOf, type CalendarDay } from "../lib/time";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

function Stamp({ status, enabled }: { status: CalendarDay["status"]; enabled: boolean }) {
  if (status === "achieved" && enabled)
    return (
      <svg className="stamp achieved" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="#e4f8f2" stroke="#2fc3a8" strokeWidth="3.4" />
        <path d="M7.800 12.300l3 3 5.500-6" fill="none" stroke="#2fc3a8" strokeWidth="2.600" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (status === "achieved")
    return (
      <svg className="stamp" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill="none" stroke="#2fc3a8" strokeWidth="2.400" />
      </svg>
    );
  if (status === "partial")
    return (
      <svg className="stamp partial" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.500" fill="none" stroke="#ffb454" strokeWidth="3" />
        <path d="M12 3.500a8.500 8.500 0 0 1 0 17Z" fill="#ffb454" />
      </svg>
    );
  if (status === "none")
    return (
      <svg className="stamp none" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.500" fill="none" stroke="#cdd6e2" strokeWidth="2.200" />
      </svg>
    );
  return <span className="stamp-gap" />;
}

const statusLabel = { achieved: "目標達成", partial: "未達成", none: "記録なし", future: "" } as const;

export function CalendarPage() {
  const { now, todayKey, intervals, sessions, targetFor, settings, child } = useAppData();
  const t = parseDayKey(todayKey);
  const [ym, setYm] = useState({ y: t.y, m: t.m });
  const [selected, setSelected] = useState(todayKey);
  const month = useMemo(() => summarizeMonth(intervals, ym.y, ym.m, targetFor, todayKey), [intervals, ym, targetFor, todayKey]);
  const lead = month.days[0].weekday;
  const stampOn = settings?.rewardStampEnabled ?? true;
  const streak = currentStreak(intervals, targetFor, todayKey);

  const move = (d: number) => {
    const n = ym.y * 12 + (ym.m - 1) + d;
    const next = { y: Math.floor(n / 12), m: (n % 12) + 1 };
    setYm(next);
    // 今月に戻ったら今日、それ以外は1日を選択
    setSelected(next.y === t.y && next.m === t.m ? todayKey : `${next.y}-${String(next.m).padStart(2, "0")}-01`);
  };

  const sel = parseDayKey(selected);
  const selFuture = selected > todayKey;
  const selTarget = targetFor(selected);
  const sum = summarizeDay(intervals, selected, selTarget);
  const wd = WEEK[weekdayOf(selected)];

  return (
    <>
      <Hero childName={child?.name ?? ""} />
      <main className="page cal-page">
        <section className="card cal-card" aria-label="月間カレンダー">
          <div className="cal-head">
            <button type="button" className="icon-btn" onClick={() => move(-1)} aria-label="前の月">
              ‹
            </button>
            <h2 aria-live="polite">
              {ym.y}年{ym.m}月
            </h2>
            <button type="button" className="icon-btn" onClick={() => move(1)} aria-label="次の月">
              ›
            </button>
          </div>
          <div className="cal-grid" aria-label={`${ym.y}年${ym.m}月の日付`}>
            {WEEK.map((w, i) => (
              <div key={w} className={`cal-dow d${i}`} aria-hidden="true">
                {w}
              </div>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <div key={`b${i}`} aria-hidden="true" />
            ))}
            {month.days.map((d) => (
              <button
                key={d.dayKey}
                type="button"
                className={`cal-day d${d.weekday}${d.isToday ? " today" : ""}${d.dayKey === selected ? " selected" : ""}${d.status === "future" ? " future" : ""}`}
                onClick={() => setSelected(d.dayKey)}
                aria-pressed={d.dayKey === selected}
                aria-current={d.isToday ? "date" : undefined}
                aria-label={`${ym.m}月${d.day}日 ${d.isToday ? "今日 " : ""}${statusLabel[d.status]}${d.status !== "future" && d.minutes ? ` ${fmtDuration(d.minutes)}` : ""}`}
              >
                <span className="cal-num">{d.day}</span>
                <Stamp status={d.status} enabled={stampOn} />
              </button>
            ))}
          </div>
          <ul className="legend" aria-label="凡例">
            <li>
              <Stamp status="achieved" enabled /> 目標達成
            </li>
            <li>
              <Stamp status="partial" enabled /> 未達成
            </li>
            <li>
              <Stamp status="none" enabled /> 記録なし
            </li>
          </ul>
        </section>

        <section className="month-summary" aria-label="今月の達成">
          <div className="card mini">
            <p className="mini-label">今月の達成</p>
            <p className="mini-val">
              {month.achievedCount} / {month.elapsedDays}
              <small>日</small>
            </p>
            <p className="mini-sub">達成率 {month.ratePercent}%</p>
          </div>
          <div className="card mini">
            <p className="mini-label">連続達成</p>
            <p className="mini-val">
              {streak}
              <small>日</small>
            </p>
            <p className="mini-sub">{streak > 0 ? `${streak}日連続で達成中！` : "今日からスタート！"}</p>
          </div>
        </section>

        <section className="card detail-card" aria-label={`${sel.m}月${sel.d}日の記録`} aria-live="polite">
          <h2>
            {sel.m}月{sel.d}日（{wd}）{selected === todayKey && <span className="badge">今日</span>}
          </h2>
          {selFuture ? (
            <p className="empty">この日はまだ先です。</p>
          ) : (
            <>
              <dl className="detail-kv">
                <div>
                  <dt>装着時間</dt>
                  <dd className="big">{fmtDuration(sum.totalMinutes)}</dd>
                </div>
                <div>
                  <dt>目標</dt>
                  <dd>{fmtDuration(selTarget, { short: true })}</dd>
                </div>
                <div>
                  <dt>結果</dt>
                  <dd className={sum.achieved ? "ok" : "ng"}>
                    {sum.achieved ? (
                      <>
                        <span aria-hidden="true">◎ </span>目標達成！{sum.overMinutes > 0 && <small> +{sum.overMinutes}分</small>}
                      </>
                    ) : (
                      <>あと{fmtDuration(sum.remainingMinutes)}</>
                    )}
                  </dd>
                </div>
              </dl>
              {sum.achieved ? (
                <p className="praise">
                  <Mascot size={36} mood="cheer" /> よくできました！
                </p>
              ) : selected !== todayKey && sum.totalMinutes > 0 ? (
                <p className="praise soft">
                  <Mascot size={36} /> つぎもいっしょにがんばろう！
                </p>
              ) : null}
              <h3>装着履歴</h3>
              <DayRecords sessions={sessions} dayKey={selected} now={now} emptyText="この日の記録はありません" />
            </>
          )}
        </section>
      </main>
    </>
  );
}
