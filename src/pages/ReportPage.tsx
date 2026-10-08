import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../app/AppData";
import { dailySeries, summarize } from "../lib/stats";
import { DAY_MS, dayStartMs, daysInMonth, entriesOnDay, fmtDuration, jstHM, monthKey, parseDayKey, weekdayOf, type DayEntry } from "../lib/time";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

/** 例: "07:00→12:00" / "前日20:00→07:00" / "20:00→翌07:00" / "20:00→24:00" */
function rangeText(e: DayEntry, dayKey: string): string {
  const start = e.fromPrevDay ? `前日${jstHM(Date.parse(e.session.startTime))}` : jstHM(e.start);
  let end: string;
  if (e.active) end = "装着中";
  else if (e.toNextDay) end = `翌${jstHM(Date.parse(e.session.endTime!))}`;
  else end = e.end === dayStartMs(dayKey) + DAY_MS ? "24:00" : jstHM(e.end);
  return `${start}→${end}`;
}

/**
 * 歯科医院に見せる・保存するための月ごとのレポート。
 * 端末の「印刷」から「PDFとして保存」できる (日本語フォントを埋め込む必要がなく、どの端末でも崩れない)。
 */
export function ReportPage() {
  const { intervals, sessions, todayKey, targetFor, child, now } = useAppData();
  const nav = useNavigate();
  const t = parseDayKey(todayKey);
  const [ym, setYm] = useState({ y: t.y, m: t.m });
  const move = (d: number) => {
    const n = ym.y * 12 + (ym.m - 1) + d;
    setYm({ y: Math.floor(n / 12), m: (n % 12) + 1 });
  };
  const n = daysInMonth(ym.y, ym.m);
  const lastKey = monthKey(ym.y, ym.m, n);
  const endKey = lastKey > todayKey ? todayKey : lastKey;
  const elapsed = endKey < monthKey(ym.y, ym.m, 1) ? 0 : parseDayKey(endKey).d;
  const days = elapsed ? dailySeries(intervals, endKey, elapsed, targetFor) : [];
  const sum = summarize(days);
  const isPreview = !!import.meta.env.VITE_PREVIEW;

  return (
    <main className="report">
      <div className="report-tools no-print">
        <button type="button" className="btn outline" onClick={() => nav(-1)}>
          ‹ もどる
        </button>
        <div className="report-month">
          <button type="button" className="icon-btn" onClick={() => move(-1)} aria-label="前の月">
            ‹
          </button>
          <span>
            {ym.y}年{ym.m}月
          </span>
          <button type="button" className="icon-btn" onClick={() => move(1)} aria-label="次の月" disabled={monthKey(ym.y, ym.m, 1) > todayKey}>
            ›
          </button>
        </div>
        <button type="button" className="btn mint" onClick={() => window.print()} disabled={isPreview}>
          印刷 / PDFで保存
        </button>
        <p className="hint small">
          {isPreview
            ? "プレビュー版では印刷できません（アプリ本体では使えます）。"
            : "印刷の画面で「PDFとして保存」を選ぶとPDFになります（iPhone は共有 →「プリント」→ 2本指で拡大 → 共有で保存）。"}
        </p>
      </div>

      <article className="report-sheet" aria-label="装着記録レポート">
        <header className="report-head">
          <h1>矯正装置 装着記録</h1>
          <dl>
            <div>
              <dt>お名前</dt>
              <dd>{child?.name || "（未設定）"}</dd>
            </div>
            <div>
              <dt>期間</dt>
              <dd>
                {ym.y}年{ym.m}月1日〜{parseDayKey(endKey).m === ym.m ? `${parseDayKey(endKey).d}日` : "—"}
              </dd>
            </div>
            <div>
              <dt>1日の目標</dt>
              <dd>{fmtDuration(targetFor(endKey), { short: true })}</dd>
            </div>
            <div>
              <dt>作成日</dt>
              <dd>
                {t.y}年{t.m}月{t.d}日 {jstHM(now)}
              </dd>
            </div>
          </dl>
        </header>

        <section className="report-summary">
          <div>
            <p>目標を達成した日</p>
            <strong>
              {sum.achievedDays} / {sum.days}日
            </strong>
            <span>達成率 {sum.ratePercent}%</span>
          </div>
          <div>
            <p>1日の平均</p>
            <strong>{fmtDuration(sum.averageMinutes)}</strong>
            <span>記録のない日も0として計算</span>
          </div>
          <div>
            <p>最長 / 最短</p>
            <strong>{sum.longest ? fmtDuration(sum.longest.minutes) : "—"}</strong>
            <span>最短 {sum.shortest ? fmtDuration(sum.shortest.minutes) : "—"}</span>
          </div>
        </section>

        <table className="report-table">
          <thead>
            <tr>
              <th scope="col">日付</th>
              <th scope="col">装着時間</th>
              <th scope="col">目標</th>
              <th scope="col">結果</th>
              <th scope="col">装着した時間帯</th>
            </tr>
          </thead>
          <tbody>
            {days.map((p) => {
              const { m, d } = parseDayKey(p.dayKey);
              const w = weekdayOf(p.dayKey);
              const ents = entriesOnDay(sessions, p.dayKey, now);
              return (
                <tr key={p.dayKey} className={w === 0 ? "sun" : w === 6 ? "sat" : ""}>
                  <th scope="row">
                    {m}/{d}（{WEEK[w]}）
                  </th>
                  <td className="num">{p.minutes ? fmtDuration(p.minutes) : "—"}</td>
                  <td className="num">{fmtDuration(p.target, { short: true })}</td>
                  <td>{p.achieved ? "◎ 達成" : p.minutes ? `あと${fmtDuration(p.target - p.minutes)}` : "記録なし"}</td>
                  <td className="ranges">
                    {ents.map((e) => rangeText(e, p.dayKey)).join("、")}
                  </td>
                </tr>
              );
            })}
            {!days.length && (
              <tr>
                <td colSpan={5}>この月の記録はまだありません。</td>
              </tr>
            )}
          </tbody>
        </table>
        <footer className="report-foot">
          きょうせいタイムで記録。日付は日本時間で区切り、日付をまたぐ装着はそれぞれの日に分けて集計しています。このアプリは医療診断を行うものではありません。
        </footer>
      </article>
    </main>
  );
}
