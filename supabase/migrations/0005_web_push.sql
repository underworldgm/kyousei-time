-- Web Push: アプリを閉じていても届く通知
-- push_subscriptions: 通知を受け取る端末 (ブラウザごと)
-- push_schedules: 送る予定 (子ども × 種類ごとに1行。アプリが装着開始・設定変更のたびに更新する)

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table if not exists public.push_schedules (
  user_id       uuid not null references auth.users (id) on delete cascade,
  child_id      uuid not null,
  kind          text not null check (kind in ('goal', 'reminder')),
  -- null なら送らない (取り消し)
  send_at       timestamptz,
  title         text not null default 'きょうせいタイム',
  body          text not null default '',
  silent        boolean not null default false,
  -- true なら送ったあと翌日の同じ時刻に繰り越す (リマインダー)
  repeat_daily  boolean not null default false,
  last_sent_at  timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (child_id, kind)
);
create index if not exists push_schedules_due_idx on public.push_schedules (send_at) where send_at is not null;

alter table public.push_subscriptions enable row level security;
alter table public.push_schedules     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['push_subscriptions', 'push_schedules'] loop
    execute format('drop policy if exists "%1$s_own" on public.%1$I', t);
    execute format('create policy "%1$s_own" on public.%1$I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

revoke all on public.push_subscriptions, public.push_schedules from anon;
grant select, insert, update, delete on public.push_subscriptions, public.push_schedules to authenticated;
-- 送信は Edge Function (service_role) が行う。service_role は RLS の対象外。
