-- 通知の細かい設定 (リマインダー・通知音・アイコンのしるし)
alter table public.settings
  add column if not exists reminder_enabled   boolean not null default false,
  add column if not exists reminder_time      text    not null default '20:00' check (reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column if not exists notification_sound boolean not null default true,
  add column if not exists badge_enabled      boolean not null default true;
