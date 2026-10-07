# Supabase セットアップ

1. https://supabase.com でプロジェクトを作成
2. SQL Editor で `migrations/0001_init.sql` → `migrations/0002_rls.sql` を順に実行
   (Supabase CLI の場合: `supabase link --project-ref <ref>` → `supabase db push`)
3. Authentication → Providers → Email を有効化 (Magic Link)
4. Authentication → URL Configuration の Site URL / Redirect URLs にデプロイ先URLと `http://localhost:5173` を追加
5. Project Settings → API の `Project URL` と `anon public` キーを `.env` の
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` に設定 (service_role キーは絶対に使わない)

`schema.sql` は 0001 + 0002 を結合した参照用スナップショットです。
