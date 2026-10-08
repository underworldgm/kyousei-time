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
