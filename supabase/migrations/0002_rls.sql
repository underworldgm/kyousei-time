-- Row Level Security: ユーザーは自分 (user_id = auth.uid()) の行だけ読み書きできる。
-- children も所有者 user_id で制限する (将来: 保護者 1 : 子ども N)。

alter table public.profiles       enable row level security;
alter table public.children       enable row level security;
alter table public.settings       enable row level security;
alter table public.wear_sessions  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'children', 'settings', 'wear_sessions'] loop
    execute format('drop policy if exists "%1$s_select_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$I', t);
    execute format('create policy "%1$s_select_own" on public.%1$I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s_insert_own" on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s_update_own" on public.%1$I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    -- 物理削除はアプリからは行わない (論理削除のみ)。アカウント削除時は auth.users の cascade で消える。
  end loop;
end $$;

-- anon ロールには何も許可しない
revoke all on public.profiles, public.children, public.settings, public.wear_sessions from anon;
grant select, insert, update on public.profiles, public.children, public.settings, public.wear_sessions to authenticated;
