import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** 環境変数が未設定ならクラウド機能は無効 (ローカル専用モード) */
export const supabase: SupabaseClient | null =
  url && key && !url.includes("YOUR-PROJECT")
    ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    : null;

export const cloudConfigured = supabase !== null;
