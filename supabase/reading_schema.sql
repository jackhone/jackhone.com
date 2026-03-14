-- Simplified reading schema for personal book tracking.
-- Apply in Supabase SQL editor.
-- Note: This resets earlier draft tables if present.

drop table if exists public.reading_entries cascade;
drop table if exists public.books cascade;
drop type if exists public.reading_status cascade;

create type public.reading_status as enum ('up_next', 'in_progress', 'finished');

create table if not exists public.reading_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  authors text not null,
  status public.reading_status not null default 'up_next',
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists reading_books_set_updated_at on public.reading_books;
create trigger reading_books_set_updated_at
before update on public.reading_books
for each row execute function public.set_updated_at();

alter table public.reading_books enable row level security;

drop policy if exists reading_books_select_own on public.reading_books;
create policy reading_books_select_own
on public.reading_books
for select
using (user_id = auth.uid());

drop policy if exists reading_books_insert_own on public.reading_books;
create policy reading_books_insert_own
on public.reading_books
for insert
with check (user_id = auth.uid());

drop policy if exists reading_books_update_own on public.reading_books;
create policy reading_books_update_own
on public.reading_books
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists reading_books_delete_own on public.reading_books;
create policy reading_books_delete_own
on public.reading_books
for delete
using (user_id = auth.uid());
