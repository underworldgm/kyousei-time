import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { adoptAuthUser } from "../db/repo";
import { requestSync, setSignedOut } from "../lib/sync";

/** Supabase Auth (メールの Magic Link)。未設定・未ログインでもアプリは「この端末のみ」で完全に動く。 */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const apply = async (s: Session | null) => {
      setSession(s);
      if (s) {
        await adoptAuthUser(s.user.id);
        requestSync(0);
      } else {
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

  return { session, busy, message, signIn, signOut };
}
