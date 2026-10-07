import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { adoptAuthUser, markSignedOut } from "../db/repo";
import { requestSync, setSignedOut } from "../lib/sync";

export interface AuthState {
  session: Session | null;
  busy: boolean;
  message: string | null;
  signIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

/**
 * Supabase Auth (メールの Magic Link)。未設定・未ログインでもアプリは「この端末のみ」で完全に動く。
 * ログインリンクはどの画面に戻っても処理されるよう、アプリ全体で1つだけ監視する。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthState();
  return createElement(AuthCtx.Provider, { value }, children);
}

export function useAuth(): AuthState {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("AuthProvider がありません");
  return v;
}

function useAuthState(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const apply = async (s: Session | null) => {
      if (s) {
        const r = await adoptAuthUser(s.user.id);
        if (r.blocked) {
          // 前のアカウントの未同期の記録を守るため、このログインは取り消す
          setMessage("この端末には、前にログインしていたアカウントの未同期の記録があります。先に前のアカウントでログインして同期してから切り替えてください。");
          await supabase?.auth.signOut();
          return;
        }
        setSession(s);
        requestSync(0);
      } else {
        setSession(null);
        await markSignedOut();
        setSignedOut();
      }
    };
    void supabase.auth.getSession().then(({ data }) => apply(data.session)).catch(() => undefined);
    const { data } = supabase.auth.onAuthStateChange((_e, s) => void apply(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string) => {
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    setMessage(error ? `送信できませんでした: ${error.message}` : "ログイン用のリンクをメールで送りました。メールのリンクを開いてください。");
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  return useMemo(() => ({ session, busy, message, signIn, signOut }), [session, busy, message, signIn, signOut]);
}
