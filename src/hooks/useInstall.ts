import { useCallback, useEffect, useState } from "react";

interface BIPEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "kyousei-install-dismissed";

const safeGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

export function useInstall() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => Date.now() - Number(safeGet(DISMISS_KEY) ?? 0) < 14 * 86400_000);
  const standalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document);

  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    const done = () => setEvt(null);
    window.addEventListener("beforeinstallprompt", on);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", on);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  const install = useCallback(async () => {
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice.catch(() => undefined);
    setEvt(null);
  }, [evt]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* 保存できなくてもよい */
    }
    setDismissed(true);
  }, []);

  /** "native": ブラウザのインストールダイアログ / "ios": 共有→ホーム画面に追加 の案内 / null: 不要 */
  const kind: "native" | "ios" | null = standalone ? null : evt ? "native" : isIOS ? "ios" : null;
  return { kind, install, dismiss, dismissed };
}
