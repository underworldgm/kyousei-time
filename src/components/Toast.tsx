import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

interface ToastItem {
  id: number;
  text: string;
  actionLabel?: string;
  action?: () => void | Promise<void>;
}

const Ctx = createContext<(t: Omit<ToastItem, "id"> & { ms?: number }) => void>(() => undefined);

/** 画面下 (ナビの上) に短いお知らせを出す。「元に戻す」などのボタンを1つ付けられる */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const show = useCallback((t: Omit<ToastItem, "id"> & { ms?: number }) => {
    if (timer.current) clearTimeout(timer.current);
    const id = ++seq.current;
    setItem({ id, text: t.text, actionLabel: t.actionLabel, action: t.action });
    timer.current = setTimeout(() => setItem((cur) => (cur?.id === id ? null : cur)), t.ms ?? 7000);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toast-area" aria-live="polite">
        {item && (
          <div className="toast" role="status">
            <span>{item.text}</span>
            {item.action && (
              <button
                type="button"
                onClick={async () => {
                  const a = item.action!;
                  setItem(null);
                  await a();
                }}
              >
                {item.actionLabel ?? "OK"}
              </button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
