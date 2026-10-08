/**
 * ごほうびスタンプ (オリジナル SVG イラスト)。目標を達成した日にカレンダーへ押される。
 * 日付ごとに絵柄が決まり (同じ日はいつも同じ絵)、毎日どれが出るか楽しめるようにしている。
 */

export const STAMP_KINDS = ["tooth", "star", "flower", "heart", "crown", "rainbow"] as const;
export type StampKind = (typeof STAMP_KINDS)[number];

export const STAMP_NAMES: Record<StampKind, string> = {
  tooth: "はのこ",
  star: "ほし",
  flower: "おはな",
  heart: "ハート",
  crown: "おうかん",
  rainbow: "にじ",
};

/** 日付キー (YYYY-MM-DD) から絵柄を決める。連続する日は違う絵柄になりやすい。 */
export function stampKindFor(dayKey: string): StampKind {
  let h = 0;
  for (const c of dayKey) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const day = Number(dayKey.slice(8, 10)) || 0;
  return STAMP_KINDS[(day + (h % 3)) % STAMP_KINDS.length];
}

/** はんこを押したような少しの傾き (-12〜12度) */
function tiltFor(dayKey: string): number {
  const d = Number(dayKey.slice(8, 10)) || 0;
  return ((d * 37) % 25) - 12;
}

const BG: Record<StampKind, { fill: string; ring: string }> = {
  tooth: { fill: "#d9f6ef", ring: "#2fbf9f" },
  star: { fill: "#fff3c4", ring: "#f2b52f" },
  flower: { fill: "#ffe3ec", ring: "#f27fa0" },
  heart: { fill: "#ffe6e2", ring: "#f0675c" },
  crown: { fill: "#fff0cc", ring: "#e6a321" },
  rainbow: { fill: "#e3f4ff", ring: "#5aaee8" },
};

/** かわいい顔 (目・ほっぺ・口)。cx, cy は顔の中心 */
function Face({ cx, cy, s = 1 }: { cx: number; cy: number; s?: number }) {
  return (
    <g>
      <circle cx={cx - 3.2 * s} cy={cy} r={1.25 * s} fill="#1d2a44" />
      <circle cx={cx + 3.2 * s} cy={cy} r={1.25 * s} fill="#1d2a44" />
      <ellipse cx={cx - 5.4 * s} cy={cy + 2.4 * s} rx={1.6 * s} ry={1.05 * s} fill="#ff9aa8" opacity=".85" />
      <ellipse cx={cx + 5.4 * s} cy={cy + 2.4 * s} rx={1.6 * s} ry={1.05 * s} fill="#ff9aa8" opacity=".85" />
      <path d={`M${cx - 1.8 * s} ${cy + 1.8 * s} Q${cx} ${cy + 3.6 * s} ${cx + 1.8 * s} ${cy + 1.8 * s}`} stroke="#1d2a44" strokeWidth={0.9 * s} fill="none" strokeLinecap="round" />
    </g>
  );
}

function Art({ kind }: { kind: StampKind }) {
  switch (kind) {
    case "tooth":
      return (
        <g>
          <path
            d="M20 9.5c-3-2-9-1.2-9.6 4.6-.4 4 1.6 5.6 2.4 9.4.6 3 1.6 6.2 3.2 6 1.8-.2 1.6-4 4-4s2.2 3.8 4 4c1.6.2 2.6-3 3.2-6 .8-3.8 2.8-5.4 2.4-9.4C29 8.3 23 7.5 20 9.5Z"
            fill="#fff"
            stroke="#8fd3c4"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <Face cx={20} cy={16.6} s={0.8} />
          <path d="M13.6 22.4q6.4 1.6 12.8 0" stroke="#9fb3c8" strokeWidth=".9" fill="none" strokeLinecap="round" />
          <rect x="15.2" y="21.2" width="2.2" height="2.2" rx=".6" fill="#7fcaf5" />
          <rect x="18.9" y="21.9" width="2.2" height="2.2" rx=".6" fill="#ffd66b" />
          <rect x="22.6" y="21.2" width="2.2" height="2.2" rx=".6" fill="#ff9aa2" />
        </g>
      );
    case "star":
      return (
        <g>
          <path
            d="M20 7.5l3.5 7.3 8 1.1-5.8 5.6 1.4 7.9L20 25.6l-7.1 3.8 1.4-7.9-5.8-5.6 8-1.1Z"
            fill="#ffd34d"
            stroke="#f0a92a"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <Face cx={20} cy={18.2} s={0.78} />
        </g>
      );
    case "flower":
      return (
        <g>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="20" cy="12.2" rx="4.4" ry="5.4" fill="#ff9fbc" stroke="#f27fa0" strokeWidth="1" transform={`rotate(${a} 20 19)`} />
          ))}
          <circle cx="20" cy="19" r="5.6" fill="#ffe27a" stroke="#f0b93a" strokeWidth="1" />
          <Face cx={20} cy={18.6} s={0.62} />
        </g>
      );
    case "heart":
      return (
        <g>
          <path
            d="M20 30s-10-6-10-12.6c0-3.4 2.6-5.6 5.4-5.6 2 0 3.6 1 4.6 2.6 1-1.6 2.6-2.6 4.6-2.6 2.8 0 5.4 2.2 5.4 5.6C30 24 20 30 20 30Z"
            fill="#ff8a8a"
            stroke="#e65f5f"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path d="M14.2 15.4c.6-1.2 1.6-1.8 2.8-1.8" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity=".8" />
          <Face cx={20} cy={19.4} s={0.78} />
        </g>
      );
    case "crown":
      return (
        <g>
          <path d="M10.5 26.5 9 13.5l5.8 4.6L20 10l5.2 8.1 5.8-4.6-1.5 13Z" fill="#ffd34d" stroke="#e0a020" strokeWidth="1.3" strokeLinejoin="round" />
          <rect x="10.4" y="25.2" width="19.2" height="3.6" rx="1.6" fill="#f7c235" stroke="#e0a020" strokeWidth="1.1" />
          <circle cx="20" cy="9.6" r="1.6" fill="#ff8175" />
          <circle cx="9" cy="13.2" r="1.3" fill="#7fcaf5" />
          <circle cx="31" cy="13.2" r="1.3" fill="#7fcaf5" />
          <Face cx={20} cy={20} s={0.7} />
        </g>
      );
    case "rainbow":
      return (
        <g>
          {["#ff9aa2", "#ffd08a", "#fff09a", "#a8e6b8", "#9fd4f5"].map((c, i) => (
            <path key={c} d={`M${8 + i * 2.2} 24 A${12 - i * 2.2} ${12 - i * 2.2} 0 0 1 ${32 - i * 2.2} 24`} fill="none" stroke={c} strokeWidth="2.4" />
          ))}
          <path d="M6.5 27.5c-1.8 0-3-1.3-2.6-2.9.3-1.3 1.6-2 2.8-1.6.4-1.9 2.2-3 4-2.4 1.4.4 2.2 1.6 2.2 3 1.8-.4 3.2.8 3.2 2.3 0 .9-.6 1.6-1.6 1.6Z" fill="#fff" stroke="#bfe0ef" strokeWidth=".9" />
          <path d="M23.4 27.5c-1.4 0-2.2-1-1.9-2.2.3-1 1.2-1.5 2.1-1.2.3-1.5 1.7-2.3 3.1-1.8 1 .3 1.7 1.2 1.7 2.3 1.4-.3 2.5.6 2.5 1.8 0 .6-.5 1.1-1.2 1.1Z" fill="#fff" stroke="#bfe0ef" strokeWidth=".9" />
          <Face cx={20} cy={18.6} s={0.62} />
        </g>
      );
  }
}

interface Props {
  dayKey: string;
  /** 絵柄を指定 (省略時は日付から決まる) */
  kind?: StampKind;
  size?: number;
  className?: string;
  /** 傾けない (凡例・一覧用) */
  straight?: boolean;
}

export function RewardStamp({ dayKey, kind, size = 28, className = "", straight = false }: Props) {
  const k = kind ?? stampKindFor(dayKey);
  const c = BG[k];
  return (
    <svg
      className={`reward-stamp ${className}`}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      style={straight ? undefined : { transform: `rotate(${tiltFor(dayKey)}deg)` }}
      data-kind={k}
    >
      <circle cx="20" cy="20" r="18.4" fill={c.fill} stroke={c.ring} strokeWidth="2.2" />
      <circle cx="20" cy="20" r="15.6" fill="none" stroke={c.ring} strokeWidth=".9" strokeDasharray="1.6 1.9" opacity=".7" />
      <Art kind={k} />
    </svg>
  );
}
