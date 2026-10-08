import { useMemo, useState } from "react";
import { useAppData } from "../app/AppData";
import { Hero } from "../components/Hero";
import { dailySeries, summarize, weeklySeries, type DayPoint, type WeekPoint } from "../lib/stats";
import { fmtDuration, parseDayKey, weekdayOf } from "../lib/time";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
type Range = "week" | "month" | "quarter";
const RANGES: { key: Range; label: string }[] = [
  { key: "week", label: "週" },
  { key: "month", label: "月" },
  { key: "quarter", label: "3か月" },
];

/** 達成 / 未達成のバーの色 (白い背景で 3:1 以上・色覚差でも区別できることを検証済み) */
const C_OK = "#16907b";
const C_NG = "#cf7a12";

const md = (key: string) => {
  const { m, d } = parseDayKey(key);
  return `${m}/${d}`;
};

interface Bar {
  key: string;
  minutes: number;
  target: number;
  achieved: boolean;
  label: string;
  /** 軸に表示するか */
  tick: boolean;
  /** 詳細表示 */
  title: string;
  detail: string;
}

function toBars(range: Range, days: DayPoint[], weeks: WeekPoint[]): Bar[] {
  if (range === "quarter") {
    return weeks.map((w, i) => ({
      key: w.startKey,
      minutes: w.averageMinutes,
      target: w.target,
      achieved: w.achieved,
      label: md(w.startKey),
      tick: i % 3 === 0 || i === weeks.length - 1,
      title: `${md(w.startKey)}〜${md(w.endKey)} の週`,
      detail: `1日平均 ${fmtDuration(w.averageMinutes)}・達成 ${w.achievedDays}/${w.days}日`,
    }));
  }
  return days.map((p, i) => ({
    key: p.dayKey,
    minutes: p.minutes,
    target: p.target,
    achieved: p.achieved,
    label: range === "week" ? WEEK[weekdayOf(p.dayKey)] : md(p.dayKey),
    tick: range === "week" || i % 5 === 0 || i === days.length - 1,
    title: `${md(p.dayKey)}（${WEEK[weekdayOf(p.dayKey)]}）`,
    detail: p.minutes ? `${fmtDuration(p.minutes)}・${p.achieved ? "目標達成" : `あと${fmtDuration(p.target - p.minutes)}`}` : "記録なし",
  }));
}

/** 棒グラフ (SVG)。目標は破線。棒をタップすると上に詳細を表示する */
function BarChart({ bars, selected, onSelect }: { bars: Bar[]; selected: string | null; onSelect: (k: string) => void }) {
  const W = 340;
  const H = 190;
  const left = 30;
  const right = 8;
  const top = 12;
  const bottom = 24;
  const maxH = Math.max(18, Math.ceil(Math.max(...bars.map((b) => Math.max(b.minutes, b.target))) / 60 / 6) * 6);
  const y = (min: number) => top + (H - top - bottom) * (1 - min / 60 / maxH);
  const slot = (W - left - right) / bars.length;
  const bw = Math.max(3, Math.min(26, slot - 2)); // 隣の棒とのすき間 2px 以上
  const ticks = Array.from({ length: maxH / 6 + 1 }, (_, i) => i * 6);
  const target = bars[bars.length - 1]?.target ?? 840;
  return (
    <svg className="bar-chart" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="装着時間のグラフ。棒を選ぶと詳細が読み上げられます。下の一覧でも確認できます">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={W - right} y1={y(t * 60)} y2={y(t * 60)} className="grid" />
          <text x={left - 6} y={y(t * 60) + 3.5} className="axis" textAnchor="end">
            {t}h
          </text>
        </g>
      ))}
      {bars.map((b, i) => {
        const x = left + slot * i + (slot - bw) / 2;
        const yy = y(b.minutes);
        const h = Math.max(0, y(0) - yy);
        const r = Math.min(4, bw / 2, h);
        const on = selected === b.key;
        return (
          <g key={b.key}>
            {h > 0 && (
              <path
                d={`M${x} ${y(0)} V${yy + r} Q${x} ${yy} ${x + r} ${yy} H${x + bw - r} Q${x + bw} ${yy} ${x + bw} ${yy + r} V${y(0)} Z`}
                fill={b.achieved ? C_OK : C_NG}
                opacity={selected && !on ? 0.45 : 1}
              />
            )}
            {/* 当たり判定は棒より大きく (タップしやすく) */}
            <rect
              x={left + slot * i}
              y={top}
              width={slot}
              height={H - top - bottom}
              fill="transparent"
              className="hit"
              tabIndex={0}
              role="button"
              aria-label={`${b.title} ${b.detail}`}
              aria-pressed={on}
              onClick={() => onSelect(b.key)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(b.key)}
            />
            {b.tick && (
              <text x={left + slot * i + slot / 2} y={H - 8} className="axis" textAnchor="middle">
                {b.label}
              </text>
            )}
          </g>
        );
      })}
      <line x1={left} x2={W - right} y1={y(target)} y2={y(target)} className="target-line" />
      <text x={W - right} y={y(target) - 4} className="target-label" textAnchor="end">
        目標 {fmtDuration(target, { short: true })}
      </text>
    </svg>
  );
}

export function StatsPage() {
  const { intervals, todayKey, targetFor, child } = useAppData();
  const [range, setRange] = useState<Range>("week");
  const [selected, setSelected] = useState<string | null>(null);

  const days = useMemo(() => dailySeries(intervals, todayKey, range === "week" ? 7 : range === "month" ? 30 : 91, targetFor), [intervals, todayKey, range, targetFor]);
  const weeks = useMemo(() => weeklySeries(intervals, todayKey, 13, targetFor), [intervals, todayKey, targetFor]);
  const bars = toBars(range, days, weeks);
  const sum = summarize(days);
  const recent = dailySeries(intervals, todayKey, 7, targetFor).slice().reverse();
  const sel = bars.find((b) => b.key === selected) ?? null;
  const maxRecent = Math.max(...recent.map((p) => Math.max(p.minutes, p.target)), 1);

  return (
    <>
      <Hero childName={child?.name ?? ""} childIcon={child?.icon} />
      <main className="page stats-page">
        <div className="seg" role="tablist" aria-label="期間">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              className={range === r.key ? "on" : ""}
              onClick={() => {
                setRange(r.key);
                setSelected(null);
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        <section className="card chart-card" aria-labelledby="chart-title">
          <div className="chart-head">
            <h2 id="chart-title">{range === "quarter" ? "週ごとの平均（13週）" : range === "month" ? "30日間の装着時間" : "7日間の装着時間"}</h2>
            <ul className="chart-legend" aria-label="凡例">
              <li>
                <span className="sw" style={{ background: C_OK }} aria-hidden="true" />
                達成
              </li>
              <li>
                <span className="sw" style={{ background: C_NG }} aria-hidden="true" />
                未達成
              </li>
            </ul>
          </div>
          <p className="chart-detail" aria-live="polite">
            {sel ? (
              <>
                <strong>{sel.title}</strong> {sel.detail}
              </>
            ) : (
              <span className="muted">棒をタップすると、くわしく見られます</span>
            )}
          </p>
          <BarChart bars={bars} selected={selected} onSelect={(k) => setSelected((s) => (s === k ? null : k))} />
        </section>

        <section className="stat-grid" aria-label="期間のまとめ">
          <div className="card mini">
            <p className="mini-label">達成した日</p>
            <p className="mini-val">
              {sum.achievedDays} / {sum.days}
              <small>日</small>
            </p>
            <div className="rate-bar" role="img" aria-label={`達成率 ${sum.ratePercent}%`}>
              <span style={{ width: `${sum.ratePercent}%` }} />
            </div>
            <p className="mini-sub">達成率 {sum.ratePercent}%</p>
          </div>
          <div className="card mini">
            <p className="mini-label">1日の平均</p>
            <p className="mini-val small">{fmtDuration(sum.averageMinutes)}</p>
            <p className="mini-sub">記録のない日も0として計算</p>
          </div>
          <div className="card mini">
            <p className="mini-label">いちばん長い日</p>
            <p className="mini-val small">{sum.longest ? fmtDuration(sum.longest.minutes) : "—"}</p>
            <p className="mini-sub">{sum.longest ? md(sum.longest.dayKey) : "記録なし"}</p>
          </div>
          <div className="card mini">
            <p className="mini-label">いちばん短い日</p>
            <p className="mini-val small">{sum.shortest ? fmtDuration(sum.shortest.minutes) : "—"}</p>
            <p className="mini-sub">{sum.shortest ? `${md(sum.shortest.dayKey)}（記録のある日）` : "記録なし"}</p>
          </div>
        </section>

        <section className="card recent-card" aria-labelledby="recent-title">
          <h2 id="recent-title">最近7日間の記録</h2>
          <table className="recent-table">
            <thead>
              <tr>
                <th scope="col">日付</th>
                <th scope="col">
                  <span className="sr-only">グラフ</span>
                </th>
                <th scope="col">装着時間</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((p) => (
                <tr key={p.dayKey}>
                  <th scope="row">
                    {md(p.dayKey)}
                    <small>（{WEEK[weekdayOf(p.dayKey)]}）</small>
                  </th>
                  <td className="mini-bar-cell" aria-hidden="true">
                    <span className="mini-bar">
                      <span style={{ width: `${(p.minutes / maxRecent) * 100}%`, background: p.achieved ? C_OK : C_NG }} />
                      <i style={{ left: `${(p.target / maxRecent) * 100}%` }} />
                    </span>
                  </td>
                  <td className="num">
                    {p.minutes ? fmtDuration(p.minutes) : "記録なし"}
                    {p.achieved && <span className="ok-mark"> ◎</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}
