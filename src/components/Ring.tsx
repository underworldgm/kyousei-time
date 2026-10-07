interface Props {
  progress: number; // 0..1
  achieved: boolean;
  size?: number;
  children: React.ReactNode;
}

/** 円形プログレス。達成時は金色のふちと星で特別感を出す。 */
export function Ring({ progress, achieved, size = 248, children }: Props) {
  const stroke = 17;
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(Math.max(progress, 0), 1);
  const angle = p * 2 * Math.PI - Math.PI / 2;
  const kx = size / 2 + r * Math.cos(angle);
  const ky = size / 2 + r * Math.sin(angle);
  return (
    <div className={`ring${achieved ? " achieved" : ""}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5fd8c2" />
            <stop offset="1" stopColor="#2ab79f" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="rgba(255,255,255,.92)" stroke="#d7f1ee" strokeWidth={stroke} />
        {p > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="url(#ring-g)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * p} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        {p > 0 && p < 1 && <circle cx={kx} cy={ky} r="5" fill="#fff" />}
      </svg>
      <div className="ring-inner">{children}</div>
    </div>
  );
}
