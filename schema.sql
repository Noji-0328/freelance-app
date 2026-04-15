-- ============================================================
-- FL Manager - Supabase Schema
-- ============================================================
-- Supabase の SQL Editor でこのファイルの内容を実行してください。

-- クライアントテーブル
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  address text,
  phone text,
  email text,
  memo text,
  created_at timestamptz default now()
);

-- タスクテーブル
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  detail text,
  client_id uuid references clients(id) on delete set null,
  price integer default 0,
  due date,
  status text check (status in ('todo','wip','done','waiting','archived')) default 'todo',
  created_at timestamptz default now()
);

-- 自分の情報テーブル（レコードは常に id=1 の1件のみ）
create table if not exists my_info (
  id integer primary key default 1,
  name text,
  address text,
  phone text,
  email text,
  bank text
);

-- ============================================================
-- RLS（Row Level Security）の設定
-- 現時点では自分だけが使うツールのため RLS は無効にする。
-- 将来的に認証を追加する場合は以下のコメントを外してください。
-- ============================================================

-- alter table clients enable row level security;
-- alter table tasks enable row level security;
-- alter table my_info enable row level security;

-- RLS が有効な場合のポリシー例（認証済みユーザーに全権限を付与）:
-- create policy "allow_all_authenticated" on clients for all to authenticated using (true);
-- create policy "allow_all_authenticated" on tasks for all to authenticated using (true);
-- create policy "allow_all_authenticated" on my_info for all to authenticated using (true);

-- ============================================================
-- インデックス（パフォーマンス向上）
-- ============================================================

create index if not exists tasks_status_idx on tasks(status);
create index if not exists tasks_due_idx on tasks(due);
create index if not exists tasks_client_id_idx on tasks(client_id);
