#!/usr/bin/env bash
# Applies every migration in supabase/migrations to a throwaway Postgres and checks the
# database-level safety rules. Run it before running a new migration on Supabase:
#
#   npm run test:db
#
# Needs Postgres installed locally (initdb, pg_ctl, psql), e.g. `brew install postgresql`.
# Nothing touches your real Supabase project or any other Postgres server.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
data="$(mktemp -d)"
port="${KICKADS_TEST_PG_PORT:-55432}"

cleanup() {
  pg_ctl -D "$data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$data"
}
trap cleanup EXIT

initdb -D "$data" -U postgres -A trust >/dev/null
printf "port = %s\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = ''\n" "$port" >> "$data/postgresql.conf"
pg_ctl -D "$data" -l "$data/log" -w start >/dev/null

# Notices (such as "already exists, skipping") are hidden; any error stops the script.
run() { PGOPTIONS="-c client_min_messages=warning" psql -h 127.0.0.1 -p "$port" -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

echo "1. Supabase stand-ins (auth schema and roles)"
run <<'SQL'
create role anon;
create role authenticated;
create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key);
-- auth.uid() is the signed-in user; tests choose it with: set test.uid = '<uuid>'
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
SQL

echo "2. Applying migrations in order"
for file in "$root"/supabase/migrations/*.sql; do
  run -f "$file"
  echo "   applied $(basename "$file")"
done

echo "3. Re-running migrations marked as safe to run more than once"
for file in "$root"/supabase/migrations/*.sql; do
  if grep -q "Safe to run more than once" "$file"; then
    run -f "$file"
    echo "   re-applied $(basename "$file")"
  fi
done

echo "4. Checking the safety rules"
run <<'SQL'
-- Supabase gives signed-in users table privileges by default; row level security does the limiting.
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;

insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
insert into gmail_connections (user_id, google_email, encrypted_refresh_token, scopes)
  values ('00000000-0000-0000-0000-00000000000a', 'alice@gmail.test', 'x', 's');
insert into email_subscriptions (user_id, connection_id, sender_key, display_name, address, domain, email_count,
  last_received_at, base_classification, confidence, unsubscribe_method, execution, protected_by)
select '00000000-0000-0000-0000-00000000000a', id, key, key, key, 'x.example', 1, now(), base, 'high', 'one_click', 'automatic', protected_by
from gmail_connections, (values
  ('news@x.example|', 'subscription', null),
  ('bank@x.example|', 'subscription', 'domain'),
  ('mum@gmail.com|', 'protected', null)) as seed(key, base, protected_by);
insert into unsubscribe_actions (user_id, sender_key, sender_address, sender_domain, display_name, method, status)
  values ('00000000-0000-0000-0000-00000000000a', 'news@x.example|', 'news@x.example', 'x.example', 'News', 'one_click', 'success');

do $$
begin
  -- A protect rule always wins over the scan's classification.
  assert (select classification from email_subscriptions where sender_key = 'bank@x.example|') = 'protected',
    'protected_by must make a sender protected';

  -- The Subscriptions list never includes protected senders.
  assert (select array_agg(sender_key) from email_subscriptions
          where classification = 'subscription' and classification <> 'protected' and ignored = false) = array['news@x.example|'],
    'the Subscriptions query must exclude protected senders';

  -- Claiming a sender for unsubscribe works once; a second claim changes nothing.
  update email_subscriptions set status = 'unsubscribing' where sender_key = 'news@x.example|' and status = 'active';
  assert (select count(*) from email_subscriptions where sender_key = 'news@x.example|' and status = 'unsubscribing') = 1;
  update email_subscriptions set status = 'unsubscribing' where sender_key = 'news@x.example|' and status = 'active';
  assert found = false, 'a second claim must update no rows';

  -- Contact form: 5 messages an hour per IP, then refused.
  assert (select array_agg(submit_contact_message('Jane', 'jane@example.com', 'Hello there, a question.', 'ip-1'))
          from generate_series(1, 6)) = array['ok', 'ok', 'ok', 'ok', 'ok', 'rate_limited'],
    'the contact rate limit must refuse the 6th message';
end $$;
SQL

echo "5. Checking row level security as signed-in users"
run <<'SQL'
-- Bob, signed in, sees none of Alice's data.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-00000000000b';
do $$
begin
  assert (select count(*) from email_subscriptions) = 0, 'Bob must not see Alice''s senders';
  assert (select count(*) from gmail_connections) = 0, 'Bob must not see Alice''s Gmail connection';
  assert (select count(*) from unsubscribe_actions) = 0, 'Bob must not see Alice''s history';
end $$;

-- Alice can read her own rows but can't upgrade herself, erase history, or read protected tables.
set test.uid = '00000000-0000-0000-0000-00000000000a';
do $$
begin
  assert (select count(*) from email_subscriptions) = 3, 'Alice must see her own senders';
  begin
    insert into user_plans (user_id, plan) values ('00000000-0000-0000-0000-00000000000a', 'premium');
    assert false, 'users must not be able to give themselves a plan';
  exception when insufficient_privilege then null;
  end;
  delete from unsubscribe_actions;
  assert (select count(*) from unsubscribe_actions) = 1, 'users must not be able to delete their history';
  assert (select count(*) from contact_messages) = 0, 'users must not read contact messages';
  assert (select count(*) from stripe_events) = 0, 'users must not read Stripe events';
end $$;
reset role;
SQL

echo "All database checks passed."
