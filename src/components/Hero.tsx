import type { ReactNode } from "react";
import { Mascot } from "./Mascot";
import { Cloud, Rainbow, Sparkle } from "./Sky";
import { SyncBadge } from "./SyncBadge";

interface Props {
  childName: string;
  mood?: "happy" | "cheer" | "sad";
  crown?: boolean;
  children?: ReactNode;
}

const LETTERS = "きょうせいタイム".split("");
const COLORS = ["#2fb8a0", "#37bfa6", "#45b8c9", "#58aee0", "#6ea7e6", "#58aee0", "#3fb7b8", "#2fb8a0"];

/** 全画面共通の上部: ロゴ・同期状態・虹と雲の空・歯のキャラクター */
export function Hero({ childName, mood = "happy", crown = false, children }: Props) {
  return (
    <header className="hero">
      <div className="hero-sky" aria-hidden="true">
        <Rainbow />
        <Cloud className="cloud-a" w={84} />
        <Cloud className="cloud-b" w={64} />
        <Sparkle x="8%" y="22%" s={12} />
        <Sparkle x="44%" y="8%" s={9} color="#9edcff" delay={0.6} />
        <Sparkle x="66%" y="58%" s={11} color="#ffb3b8" delay={1.2} />
        <Sparkle x="92%" y="16%" s={10} delay={0.3} />
      </div>
      <div className="hero-left">
        <SyncBadge />
        <p className="hero-sub">{childName ? `${childName}の` : "みんなの"}</p>
        <h1 className="logo" aria-label="きょうせいタイム">
          {LETTERS.map((c, i) => (
            <span key={i} style={{ color: COLORS[i] }} aria-hidden="true">
              {c}
            </span>
          ))}
        </h1>
        {children}
      </div>
      <Mascot className="hero-mascot" size={92} mood={mood} crown={crown} />
    </header>
  );
}
