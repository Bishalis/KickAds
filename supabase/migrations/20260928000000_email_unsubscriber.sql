-- Gmail connections, user sender rules, and unsubscribe history.
-- Every table is owner-only via row level security; the app talks to Supabase
-- with the signed-in user's session, never with a service-role key.

create table public.gmail_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  google_email text not null,
  -- AES-256-GCM ciphertext produced by the app (GOOGLE_TOKEN_ENCRYPTION_SECRET).
  encrypted_refresh_token text not null,
  scopes text not null,
  connected_at timestamptz not null default now(),
  last_scan_at timestamptz,
  last_scan_stats jsonb
);

create table public.sender_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('protect', 'ignore')),
  match_type text not null check (match_type in ('address', 'domain')),
  value text not null check (char_length(value) between 3 and 320),
  created_at timestamptz not null default now(),
  unique (user_id, kind, match_type, value)
);

create table public.unsubscribe_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sender_key text not null,
  sender_address text not null,
  sender_domain text not null,
  display_name text not null,
  list_id text,
  method text not null check (method in ('one_click', 'https', 'mailto', 'body_link', 'none')),
  status text not null check (status in ('pending', 'success', 'failed', 'manual_required', 'no_method')),
  detail text,
  target_host text,
  http_status integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index unsubscribe_actions_user_created_idx on public.unsubscribe_actions (user_id, created_at desc);
-- At most one in-flight attempt per sender: a concurrent duplicate insert fails.
create unique index unsubscribe_actions_one_pending_idx on public.unsubscribe_actions (user_id, sender_key) where status = 'pending';

alter table public.gmail_connections enable row level security;
alter table public.sender_rules enable row level security;
alter table public.unsubscribe_actions enable row level security;

create policy "Owners manage their Gmail connection" on public.gmail_connections
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "Owners manage their sender rules" on public.sender_rules
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "Owners manage their unsubscribe history" on public.unsubscribe_actions
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
