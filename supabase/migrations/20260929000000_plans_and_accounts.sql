-- Plans (Freemium / Premium), usage tracking for the free unsubscribe limit, and
-- multiple Gmail accounts per user.
-- Safe to run more than once: every step checks whether it has already been applied.

-- 1. Multiple Gmail accounts: each connection gets its own id; one row per Gmail address.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'gmail_connections' and column_name = 'id'
  ) then
    alter table public.gmail_connections drop constraint gmail_connections_pkey;
    alter table public.gmail_connections add column id uuid not null default gen_random_uuid();
    alter table public.gmail_connections add primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gmail_connections_user_email_key') then
    alter table public.gmail_connections add constraint gmail_connections_user_email_key unique (user_id, google_email);
  end if;
end $$;

alter table public.unsubscribe_actions add column if not exists account_email text;
-- Until now each user had at most one Gmail account, so existing history belongs to it.
update public.unsubscribe_actions a
  set account_email = g.google_email
  from public.gmail_connections g
  where g.user_id = a.user_id and a.account_email is null;

-- 2. Plans. Users can read their own plan but never change it; there are no insert or
-- update policies, so only the service role (SQL editor, or a future payment webhook)
-- can upgrade anyone. A user without a row is on the free plan.
create table if not exists public.user_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'premium')),
  updated_at timestamptz not null default now()
);
alter table public.user_plans enable row level security;
drop policy if exists "Owners read their plan" on public.user_plans;
create policy "Owners read their plan" on public.user_plans
  for select to authenticated using (user_id = (select auth.uid()));

-- 3. Unsubscribe usage ledger for the monthly free limit. Append-only for users: without
-- update or delete policies, the count can't be reset through the API.
create table if not exists public.unsubscribe_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action_id uuid references public.unsubscribe_actions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists unsubscribe_usage_user_created_idx on public.unsubscribe_usage (user_id, created_at desc);
alter table public.unsubscribe_usage enable row level security;
drop policy if exists "Owners read their usage" on public.unsubscribe_usage;
create policy "Owners read their usage" on public.unsubscribe_usage
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Owners record their usage" on public.unsubscribe_usage;
create policy "Owners record their usage" on public.unsubscribe_usage
  for insert to authenticated with check (user_id = (select auth.uid()));

-- 4. History is no longer deletable by users, so it stays a reliable audit trail.
drop policy if exists "Owners manage their unsubscribe history" on public.unsubscribe_actions;
drop policy if exists "Owners read their unsubscribe history" on public.unsubscribe_actions;
create policy "Owners read their unsubscribe history" on public.unsubscribe_actions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Owners record unsubscribe attempts" on public.unsubscribe_actions;
create policy "Owners record unsubscribe attempts" on public.unsubscribe_actions
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Owners update their unsubscribe attempts" on public.unsubscribe_actions;
create policy "Owners update their unsubscribe attempts" on public.unsubscribe_actions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Make the API see the new tables right away.
notify pgrst, 'reload schema';
