interface Props {
  size?: number;
  mood?: "happy" | "cheer" | "sad";
  crown?: boolean;
  className?: string;
}

/** オリジナルの歯のマスコット (SVG)。白い歯・黒い目・ピンクのほっぺ・小さな手・矯正器具。 */
export function Mascot({ size = 96, mood = "happy", crown = false, className }: Props) {
  const arms = mood === "cheer";
  return (
    <svg className={className} width={size} height={size * 1.08} viewBox="0 0 120 130" role="img" aria-label="歯のキャラクター">
      <defs>
        <linearGradient id="tooth-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#eef8fc" />
        </linearGradient>
      </defs>
      {/* 手 */}
      <circle cx={arms ? 12 : 13} cy={arms ? 46 : 74} r="8" fill="#fff" stroke="#bfe0ec" strokeWidth="2.5" />
      <circle cx={arms ? 108 : 107} cy={arms ? 46 : 74} r="8" fill="#fff" stroke="#bfe0ec" strokeWidth="2.5" />
      {/* からだ */}
      <path
        d="M60 14 C44 5 19 11 17 37 C15 57 25 66 29 88 C32 106 39 121 47 119 C56 117 55 100 60 100 C65 100 64 117 73 119 C81 121 88 106 91 88 C95 66 105 57 103 37 C101 11 76 5 60 14 Z"
        fill="url(#tooth-g)"
        stroke="#bfe0ec"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* つや */}
      <path d="M30 28 C33 20 40 17 46 17" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".9" />
      {/* 矯正器具 (ワイヤーとブラケット) */}
      <path d="M26 76 Q60 84 94 76" stroke="#9fb3c8" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <rect x="31" y="70" width="10" height="10" rx="3" fill="#7fcaf5" stroke="#fff" strokeWidth="1.5" />
      <rect x="55" y="74" width="10" height="10" rx="3" fill="#ffd66b" stroke="#fff" strokeWidth="1.5" />
      <rect x="79" y="70" width="10" height="10" rx="3" fill="#ff9aa2" stroke="#fff" strokeWidth="1.5" />
      {/* 目 */}
      {mood === "cheer" ? (
        <>
          <path d="M39 48 Q45 40 51 48" stroke="#1d2a44" strokeWidth="3.4" fill="none" strokeLinecap="round" />
          <path d="M69 48 Q75 40 81 48" stroke="#1d2a44" strokeWidth="3.4" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="45" cy="47" rx="4.6" ry="5.6" fill="#1d2a44" />
          <ellipse cx="75" cy="47" rx="4.6" ry="5.6" fill="#1d2a44" />
          <circle cx="46.8" cy="44.8" r="1.6" fill="#fff" />
          <circle cx="76.8" cy="44.8" r="1.6" fill="#fff" />
        </>
      )}
      {/* ほっぺ */}
      <ellipse cx="34" cy="60" rx="7" ry="4.6" fill="#ffb3b8" opacity=".75" />
      <ellipse cx="86" cy="60" rx="7" ry="4.6" fill="#ffb3b8" opacity=".75" />
      {/* 口 */}
      {mood === "sad" ? (
        <path d="M52 64 Q60 58 68 64" stroke="#1d2a44" strokeWidth="3" fill="none" strokeLinecap="round" />
      ) : mood === "cheer" ? (
        <>
          <path d="M50 55 Q60 72 70 55 Z" fill="#ff7d8c" stroke="#1d2a44" strokeWidth="2.6" strokeLinejoin="round" />
          <path d="M55 63 Q60 67 65 63" fill="#ffb3b8" />
        </>
      ) : (
        <path d="M51 57 Q60 67 69 57" stroke="#1d2a44" strokeWidth="3" fill="none" strokeLinecap="round" />
      )}
      {mood === "sad" && <path d="M82 52 q3 5 0 8 q-3 -3 0 -8z" fill="#9edcff" />}
      {crown && (
        <g>
          <path d="M42 18 L46 4 L54 12 L60 0 L66 12 L74 4 L78 18 Z" fill="#ffd66b" stroke="#f2b84a" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="60" cy="9" r="2" fill="#ff8175" />
        </g>
      )}
    </svg>
  );
}
