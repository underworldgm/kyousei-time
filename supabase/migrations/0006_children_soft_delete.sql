-- 子どもの削除 (論理削除)。記録は消さずに残し、一覧から見えなくする
alter table public.children add column if not exists deleted_at timestamptz;
