-- きょうせいタイム: 初期スキーマ
-- 方針: ID はクライアントが生成する UUID。同期は updated_at の Last Write Wins。
--       装着記録 (wear_sessions) は1回の装着=1行。削除は deleted_at の論理削除。

create table if not exists public.profiles (
  id            uuid primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  display_name  text not null default '',
  created_at    timestamptz not null,
  updated_at    timestamptz not null,
  synced_at     timestamptz not null default now()
);

create table if not exists public.children (
  id            uuid primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null default '',
  icon          text not null default '🦷',
  created_at    timestamptz not null,
  updated_at    timestamptz not null,
  synced_at     timestamptz not null default now()
);

create table if not exists public.settings (
  id                      uuid primary key,
  user_id                 uuid not null references auth.users (id) on delete cascade,
  child_id                uuid not null,
  daily_target_minutes    integer not null default 840 check (daily_target_minutes between 60 and 1440),
  notifications_enabled   boolean not null default true,
  reward_stamp_enabled    boolean not null default true,
  created_at              timestamptz not null,
  updated_at              timestamptz not null,
  synced_at               timestamptz not null default now()
);

create table if not exists public.wear_sessions (
  id           uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  child_id     uuid not null,
  start_time   timestamptz not null,
  end_time     timestamptz,
  created_at   timestamptz not null,
  updated_at   timestamptz not null,
  deleted_at   timestamptz,
  synced_at    timestamptz not null default now(),
  constraint wear_sessions_end_after_start check (end_time is null or end_time > start_time)
);

create index if not exists children_user_idx        on public.children (user_id, synced_at);
create index if not exists profiles_user_idx        on public.profiles (user_id, synced_at);
create index if not exists settings_user_idx        on public.settings (user_id, synced_at);
create index if not exists wear_sessions_user_idx   on public.wear_sessions (user_id, synced_at);
create index if not exists wear_sessions_child_time on public.wear_sessions (child_id, start_time);

-- synced_at: サーバー時刻。端末の時計がずれていても、他端末が確実に差分を取得できるようにする。
-- Last Write Wins: 既存行より古い updated_at での更新は無視する (データ損失防止)。
create or replace function public.kyousei_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then
      raise exception 'user_id is immutable';
    end if;
    if new.updated_at < old.updated_at then
      return null; -- 古い書き込みはスキップ
    end if;
  end if;
  new.synced_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'children', 'settings', 'wear_sessions'] loop
    execute format('drop trigger if exists kyousei_before_write on public.%I', t);
    execute format('create trigger kyousei_before_write before insert or update on public.%I
                    for each row execute function public.kyousei_before_write()', t);
  end loop;
end $$;
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
-- 目標時間の変更履歴 ([{ "from": "YYYY-MM-DD", "minutes": 840 }, ...])。
-- 過去日の達成判定を、その日に有効だった目標で行うため。
alter table public.settings
  add column if not exists target_history jsonb not null default '[]'::jsonb;
-- 通知の細かい設定 (リマインダー・通知音・アイコンのしるし)
alter table public.settings
  add column if not exists reminder_enabled   boolean not null default false,
  add column if not exists reminder_time      text    not null default '20:00' check (reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column if not exists notification_sound boolean not null default true,
  add column if not exists badge_enabled      boolean not null default true;
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
