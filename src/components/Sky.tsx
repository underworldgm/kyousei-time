/** 背景装飾: 虹・雲・星・キラキラ (SVG のみ。画像ファイル不使用) */

export function Sparkle({ x, y, s = 10, color = "#ffd66b", delay = 0 }: { x: number | string; y: number | string; s?: number; color?: string; delay?: number }) {
  return (
    <svg className="sparkle" style={{ left: x, top: y, width: s, height: s, animationDelay: `${delay}s` }} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z" fill={color} />
    </svg>
  );
}

export function Cloud({ className = "", w = 70 }: { className?: string; w?: number }) {
  return (
    <svg className={`cloud ${className}`} width={w} height={w * 0.55} viewBox="0 0 80 44" aria-hidden="true">
      <path d="M16 42 C6 42 0 35 2 27 C4 20 11 17 17 19 C18 9 28 3 38 6 C46 8 50 13 51 18 C60 14 72 20 72 30 C72 37 67 42 60 42 Z" fill="#fff" opacity=".95" />
    </svg>
  );
}

export function Rainbow({ className = "" }: { className?: string }) {
  const colors = ["#ffb3b8", "#ffd9a0", "#fff2a8", "#bfeccf", "#b4def7", "#d6c8f5"];
  return (
    <svg className={`rainbow ${className}`} viewBox="0 0 160 84" aria-hidden="true">
      {colors.map((c, i) => (
        <path key={c} d={`M${6 + i * 8} 84 A${74 - i * 8} ${74 - i * 8} 0 0 1 ${154 - i * 8} 84`} fill="none" stroke={c} strokeWidth="8" opacity=".85" />
      ))}
    </svg>
  );
}
