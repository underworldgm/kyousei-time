-- 目標時間の変更履歴 ([{ "from": "YYYY-MM-DD", "minutes": 840 }, ...])。
-- 過去日の達成判定を、その日に有効だった目標で行うため。
alter table public.settings
  add column if not exists target_history jsonb not null default '[]'::jsonb;
