-- Email subscription state, Stripe billing, and contact messages.
-- Safe to run more than once.
--
-- Three separate concepts, three separate places:
--   email_subscriptions  current state of each sender (active / unsubscribing / unsubscribed)
--   unsubscribe_actions  history: every unsubscribe attempt and its result
--   user_plans           the app plan a user pays for (Freemium / Premium) and Stripe ids

-- 1. One row per sender per connected Gmail account, written when a scan finishes. Stores
-- sender identity, classification, and unsubscribe status only: no subjects or bodies.
create table if not exists public.email_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  connection_id uuid not null references public.gmail_connections (id) on delete cascade,
  sender_key text not null,
  display_name text not null,
  address text not null,
  domain text not null,
  list_id text,
  email_count integer not null,
  last_received_at timestamptz not null,
  -- Classification from the scan, before the user's own protect rules are applied.
  base_classification text not null check (base_classification in ('subscription', 'protected', 'review')),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  reasons jsonb not null default '[]'::jsonb,
  unsubscribe_method text not null check (unsubscribe_method in ('one_click', 'https', 'mailto', 'body_link', 'none')),
  execution text not null check (execution in ('automatic', 'manual', 'none')),
  protected_by text check (protected_by in ('address', 'domain')),
  ignored boolean not null default false,
  -- What pages filter on: a user protect rule always wins.
  classification text generated always as (case when protected_by is not null then 'protected' else base_classification end) stored,
  status text not null default 'active' check (status in ('active', 'unsubscribing', 'unsubscribed')),
  status_changed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  last_seen_at timestamptz not null default now(),
  unique (connection_id, sender_key)
);
create index if not exists email_subscriptions_view_idx on public.email_subscriptions (connection_id, classification, ignored);
alter table public.email_subscriptions enable row level security;
drop policy if exists "Owners manage their email subscriptions" on public.email_subscriptions;
create policy "Owners manage their email subscriptions" on public.email_subscriptions
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 2. Stripe billing details live on the existing plan row. Users can still only read it;
-- the Stripe webhook writes it with the service role.
alter table public.user_plans add column if not exists stripe_customer_id text unique;
alter table public.user_plans add column if not exists stripe_subscription_id text;
alter table public.user_plans add column if not exists subscription_status text;
alter table public.user_plans add column if not exists current_period_end timestamptz;
alter table public.user_plans add column if not exists cancel_at_period_end boolean not null default false;

-- Stripe event ids already handled, so a redelivered webhook is applied once.
-- No policies: only the service role can touch it.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;

-- 3. Contact form messages. No policies, so nobody can read or write the table through the
-- API; submissions go through the function below, which rate-limits per sender.
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 320),
  message text not null check (char_length(message) between 10 and 5000),
  user_id uuid references auth.users (id) on delete set null,
  -- Salted hash of the submitter's IP, used only for rate limiting.
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists contact_messages_ip_created_idx on public.contact_messages (ip_hash, created_at desc);
alter table public.contact_messages enable row level security;

create or replace function public.submit_contact_message(p_name text, p_email text, p_message text, p_ip_hash text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.contact_messages where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 5 then
    return 'rate_limited';
  end if;
  insert into public.contact_messages (name, email, message, user_id, ip_hash)
  values (p_name, p_email, p_message, auth.uid(), p_ip_hash);
  return 'ok';
end;
$$;
revoke all on function public.submit_contact_message(text, text, text, text) from public;
grant execute on function public.submit_contact_message(text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
