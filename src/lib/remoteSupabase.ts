import { supabase } from "./supabase";
import { REMOTE_TABLE, type Remote, type RemoteRow } from "./sync";

const PAGE = 1000;

/** Supabase (PostgREST) 経由の Remote 実装。RLS により自分の行のみ読み書きできる。 */
export const supabaseRemote: Remote | null = supabase
  ? {
      async upsert(table, rows) {
        if (!rows.length) return;
        const { error } = await supabase!.from(REMOTE_TABLE[table]).upsert(rows, { onConflict: "id" });
        if (error) throw new Error(error.message);
      },
      async fetchSince(table, userId, since) {
        let q = supabase!
          .from(REMOTE_TABLE[table])
          .select("*")
          .eq("user_id", userId)
          .order("synced_at", { ascending: true })
          .limit(PAGE);
        if (since) q = q.gte("synced_at", since);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return (data ?? []) as RemoteRow[];
      },
    }
  : null;
