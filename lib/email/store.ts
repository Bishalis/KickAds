import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { ScanStats, SenderRule } from "./classifier.ts";
import { decryptSecret, encryptSecret } from "./google-oauth.ts";
import type { UnsubscribeMethod } from "./unsubscribe.ts";
import { PlanLimitError, planLimits, startOfUtcMonth, type Plan, type PlanUsage } from "@/lib/plans";
import { findRule } from "./classifier.ts";
import { tabFilter, type StoredSubscription, type SubscriptionRow, type SubscriptionStatus, type SubscriptionTab } from "./subscriptions.ts";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AuthedContext = { supabase: Supabase; user: User };

/** Resolves the signed-in user; every query below then runs under their RLS policies. */
export async function getAuthedContext(): Promise<AuthedContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

export type GmailAccount = {
  id: string;
  googleEmail: string;
  lastScanAt: string | null;
  lastScanStats: ScanStats | null;
  /** Connected beyond what the current plan allows (e.g. after a downgrade); not usable. */
  locked: boolean;
};

export type GmailConnection = GmailAccount & { refreshToken: string };

export async function getPlan({ supabase, user }: AuthedContext): Promise<Plan> {
  const { data, error } = await supabase.from("user_plans").select("plan").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error(`Could not load your plan: ${error.message}`);
  return data?.plan === "premium" ? "premium" : "free";
}

/** Accounts in the order they were first connected; the oldest ones fit the plan first. */
export async function listGmailAccounts({ supabase, user }: AuthedContext, plan: Plan): Promise<GmailAccount[]> {
  const { data, error } = await supabase
    .from("gmail_connections")
    .select("id, google_email, last_scan_at, last_scan_stats")
    .eq("user_id", user.id)
    .order("connected_at", { ascending: true });
  if (error) throw new Error(`Could not load Gmail connections: ${error.message}`);
  return (data ?? []).map((row, index) => ({
    id: row.id,
    googleEmail: row.google_email,
    lastScanAt: row.last_scan_at,
    lastScanStats: row.last_scan_stats,
    locked: index >= planLimits[plan].maxAccounts,
  }));
}

/**
 * The connection to use for a request: the requested account, or the first usable one.
 * Returns null when nothing is connected; throws PlanLimitError for a locked account.
 */
export async function getGmailConnection(context: AuthedContext, plan: Plan, accountId?: string | null): Promise<GmailConnection | null> {
  const accounts = await listGmailAccounts(context, plan);
  const account = accountId ? accounts.find((item) => item.id === accountId) : accounts.find((item) => !item.locked);
  if (!account) return null;
  if (account.locked) throw new PlanLimitError(`Your ${planLimits[plan].label} plan includes ${planLimits[plan].maxAccounts} Gmail account${planLimits[plan].maxAccounts === 1 ? "" : "s"}. Upgrade to use ${account.googleEmail}.`);

  const { data, error } = await context.supabase.from("gmail_connections").select("encrypted_refresh_token").eq("id", account.id).single();
  if (error) throw new Error(`Could not load the Gmail connection: ${error.message}`);
  const refreshToken = decryptSecret(data.encrypted_refresh_token);
  return refreshToken ? { ...account, refreshToken } : null;
}

export async function saveGmailConnection({ supabase, user }: AuthedContext, connection: { googleEmail: string; refreshToken: string; scopes: string }) {
  // connected_at is left to its insert default, so reconnecting keeps the account's place in line.
  const { error } = await supabase.from("gmail_connections").upsert({
    user_id: user.id,
    google_email: connection.googleEmail,
    encrypted_refresh_token: encryptSecret(connection.refreshToken),
    scopes: connection.scopes,
    last_scan_at: null,
    last_scan_stats: null,
  }, { onConflict: "user_id,google_email" });
  if (error) throw new Error(`Could not save the Gmail connection: ${error.message}`);
}

export async function deleteGmailConnection({ supabase }: AuthedContext, accountId: string) {
  const { error } = await supabase.from("gmail_connections").delete().eq("id", accountId);
  if (error) throw new Error(`Could not remove the Gmail connection: ${error.message}`);
}

export async function saveScanStats({ supabase }: AuthedContext, accountId: string, stats: ScanStats) {
  await supabase.from("gmail_connections").update({ last_scan_at: new Date().toISOString(), last_scan_stats: stats }).eq("id", accountId);
}

export async function countUnsubscribesThisMonth({ supabase }: AuthedContext) {
  const { count, error } = await supabase
    .from("unsubscribe_usage")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startOfUtcMonth().toISOString());
  if (error) throw new Error(`Could not load your usage: ${error.message}`);
  return count ?? 0;
}

/** Counts one unsubscribe toward the monthly plan limit. */
export async function recordUnsubscribeUsage({ supabase, user }: AuthedContext, actionId: string) {
  const { error } = await supabase.from("unsubscribe_usage").insert({ user_id: user.id, action_id: actionId });
  if (error) throw new Error(`Could not record usage: ${error.message}`);
}

export async function getPlanUsage(context: AuthedContext): Promise<PlanUsage> {
  const { data, error } = await context.supabase
    .from("user_plans")
    .select("plan, stripe_customer_id, subscription_status, current_period_end, cancel_at_period_end")
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (error) throw new Error(`Could not load your plan: ${error.message}`);
  const plan: Plan = data?.plan === "premium" ? "premium" : "free";
  const [unsubscribesThisMonth, accounts] = await Promise.all([countUnsubscribesThisMonth(context), listGmailAccounts(context, plan)]);
  return {
    plan,
    limits: planLimits[plan],
    unsubscribesThisMonth,
    accountsConnected: accounts.length,
    billing: {
      subscriptionStatus: data?.subscription_status ?? null,
      currentPeriodEnd: data?.current_period_end ?? null,
      cancelAtPeriodEnd: data?.cancel_at_period_end ?? false,
      hasBillingAccount: Boolean(data?.stripe_customer_id),
    },
  };
}

export async function listSenderRules({ supabase }: AuthedContext): Promise<SenderRule[]> {
  const { data, error } = await supabase.from("sender_rules").select("id, kind, match_type, value").order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load sender rules: ${error.message}`);
  return (data ?? []).map((row) => ({ id: row.id, kind: row.kind, matchType: row.match_type, value: row.value }));
}

export async function addSenderRule({ supabase, user }: AuthedContext, rule: Omit<SenderRule, "id">) {
  const { error } = await supabase.from("sender_rules").upsert(
    { user_id: user.id, kind: rule.kind, match_type: rule.matchType, value: rule.value },
    { onConflict: "user_id,kind,match_type,value", ignoreDuplicates: true },
  );
  if (error) throw new Error(`Could not save the sender rule: ${error.message}`);
}

export async function deleteSenderRule({ supabase }: AuthedContext, id: string) {
  const { error } = await supabase.from("sender_rules").delete().eq("id", id);
  if (error) throw new Error(`Could not remove the sender rule: ${error.message}`);
}

export type UnsubscribeStatus = "pending" | "success" | "failed" | "manual_required" | "no_method";

export type UnsubscribeAction = {
  id: string;
  accountEmail: string | null;
  senderKey: string;
  senderAddress: string;
  senderDomain: string;
  displayName: string;
  method: UnsubscribeMethod;
  status: UnsubscribeStatus;
  detail: string | null;
  createdAt: string;
  updatedAt: string;
};

const actionColumns = "id, account_email, sender_key, sender_address, sender_domain, display_name, method, status, detail, created_at, updated_at";

function toAction(row: Record<string, string>): UnsubscribeAction {
  return {
    id: row.id,
    accountEmail: row.account_email,
    senderKey: row.sender_key,
    senderAddress: row.sender_address,
    senderDomain: row.sender_domain,
    displayName: row.display_name,
    method: row.method as UnsubscribeMethod,
    status: row.status as UnsubscribeStatus,
    detail: row.detail,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listUnsubscribeActions({ supabase }: AuthedContext, limit = 100): Promise<UnsubscribeAction[]> {
  const { data, error } = await supabase.from("unsubscribe_actions").select(actionColumns).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Could not load unsubscribe history: ${error.message}`);
  return (data ?? []).map(toAction);
}

export async function countRecentActions({ supabase }: AuthedContext, sinceMs: number) {
  const { count } = await supabase
    .from("unsubscribe_actions")
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - sinceMs).toISOString());
  return count ?? 0;
}

/** Inserts a pending attempt. Returns null when another attempt for this sender is already in flight. */
export async function startUnsubscribeAction({ supabase, user }: AuthedContext, action: { accountEmail: string; senderKey: string; senderAddress: string; senderDomain: string; displayName: string; listId: string | null; method: UnsubscribeMethod; targetHost: string | null }) {
  // A pending row older than two minutes belongs to a request that crashed; close it out.
  await supabase.from("unsubscribe_actions")
    .update({ status: "failed", detail: "The request did not finish.", updated_at: new Date().toISOString() })
    .eq("sender_key", action.senderKey).eq("status", "pending").lt("created_at", new Date(Date.now() - 120_000).toISOString());

  const { data, error } = await supabase.from("unsubscribe_actions").insert({
    user_id: user.id,
    account_email: action.accountEmail,
    sender_key: action.senderKey,
    sender_address: action.senderAddress,
    sender_domain: action.senderDomain,
    display_name: action.displayName,
    list_id: action.listId,
    method: action.method,
    target_host: action.targetHost,
    status: "pending",
  }).select("id").single();
  if (error?.code === "23505") return null;
  if (error) throw new Error(`Could not record the unsubscribe attempt: ${error.message}`);
  return data.id as string;
}

export async function finishUnsubscribeAction({ supabase }: AuthedContext, id: string, result: { status: Exclude<UnsubscribeStatus, "pending">; detail: string; httpStatus?: number }) {
  const { error } = await supabase.from("unsubscribe_actions")
    .update({ status: result.status, detail: result.detail, http_status: result.httpStatus ?? null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Could not record the unsubscribe result: ${error.message}`);
}

export async function recordUnsubscribeAction(context: AuthedContext, action: Parameters<typeof startUnsubscribeAction>[1], result: Parameters<typeof finishUnsubscribeAction>[2]) {
  const id = await startUnsubscribeAction(context, action);
  if (id) await finishUnsubscribeAction(context, id, result);
  return id;
}

/**
 * The user confirms they finished a manual unsubscribe themselves: the history entry
 * becomes a success and the sender's subscription is marked unsubscribed.
 */
export async function confirmManualAction(context: AuthedContext, id: string) {
  const { data, error } = await context.supabase.from("unsubscribe_actions")
    .update({ status: "success", detail: "You confirmed you unsubscribed using the sender's page.", updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "manual_required").select("account_email, sender_key");
  if (error) throw new Error(`Could not update the unsubscribe history: ${error.message}`);
  const action = data?.[0];
  if (!action) return false;
  await markSubscriptionUnsubscribed(context, action.account_email, action.sender_key);
  return true;
}

// ---- Email subscriptions: the current state of each sender ----

const subscriptionColumns = "id, sender_key, display_name, address, domain, list_id, email_count, last_received_at, base_classification, classification, confidence, reasons, unsubscribe_method, execution, protected_by, ignored, status, unsubscribed_at";

/**
 * Saves a finished scan. Existing rows keep their unsubscribe status (it isn't in the
 * payload); active senders that no longer appear in the scan window are removed, while
 * unsubscribed ones are kept as the record of that decision.
 */
export async function saveScanSubscriptions({ supabase, user }: AuthedContext, connectionId: string, rows: SubscriptionRow[]) {
  const seenAt = new Date().toISOString();
  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500).map((row) => ({ ...row, user_id: user.id, connection_id: connectionId, last_seen_at: seenAt }));
    const { error } = await supabase.from("email_subscriptions").upsert(chunk, { onConflict: "connection_id,sender_key" });
    if (error) throw new Error(`Could not save scan results: ${error.message}`);
  }
  const { error } = await supabase.from("email_subscriptions").delete()
    .eq("connection_id", connectionId).eq("status", "active").lt("last_seen_at", seenAt);
  if (error) throw new Error(`Could not clean up old senders: ${error.message}`);
}

export async function listSubscriptions({ supabase }: AuthedContext, connectionId: string, tab: SubscriptionTab): Promise<StoredSubscription[]> {
  const filter = tabFilter(tab);
  let query = supabase.from("email_subscriptions").select(subscriptionColumns).eq("connection_id", connectionId);
  if (filter.classification) query = query.eq("classification", filter.classification);
  if (filter.excludeProtected) query = query.neq("classification", "protected");
  if (filter.ignored !== null) query = query.eq("ignored", filter.ignored);
  const { data, error } = await query.order("email_count", { ascending: false }).limit(5000);
  if (error) throw new Error(`Could not load subscriptions: ${error.message}`);
  return (data ?? []) as StoredSubscription[];
}

export async function countSubscriptionTabs({ supabase }: AuthedContext, connectionId: string): Promise<Record<SubscriptionTab, number>> {
  const { data, error } = await supabase.from("email_subscriptions").select("classification, ignored").eq("connection_id", connectionId).limit(20000);
  if (error) throw new Error(`Could not count subscriptions: ${error.message}`);
  const counts: Record<SubscriptionTab, number> = { subscription: 0, review: 0, ignored: 0, protected: 0 };
  for (const row of data ?? []) {
    if (row.classification === "protected") counts.protected += 1;
    else if (row.ignored) counts.ignored += 1;
    else counts[row.classification as "subscription" | "review"] += 1;
  }
  return counts;
}

export async function getSubscription({ supabase }: AuthedContext, connectionId: string, senderKey: string): Promise<StoredSubscription | null> {
  const { data, error } = await supabase.from("email_subscriptions").select(subscriptionColumns).eq("connection_id", connectionId).eq("sender_key", senderKey).maybeSingle();
  if (error) throw new Error(`Could not load the subscription: ${error.message}`);
  return data as StoredSubscription | null;
}

/**
 * Atomically moves a sender from active to unsubscribing. Returns null if it is already
 * unsubscribed or another request is working on it, which blocks duplicate unsubscribes.
 * An "unsubscribing" state older than two minutes belongs to a crashed request and can be retried.
 */
export async function claimSubscriptionForUnsubscribe({ supabase }: AuthedContext, id: string): Promise<StoredSubscription | null> {
  const stale = new Date(Date.now() - 120_000).toISOString();
  const { data, error } = await supabase.from("email_subscriptions")
    .update({ status: "unsubscribing", status_changed_at: new Date().toISOString() })
    .eq("id", id)
    .or(`status.eq.active,and(status.eq.unsubscribing,status_changed_at.lt."${stale}")`)
    .select(subscriptionColumns)
    .maybeSingle();
  if (error) throw new Error(`Could not start the unsubscribe: ${error.message}`);
  return data as StoredSubscription | null;
}

export async function setSubscriptionStatus({ supabase }: AuthedContext, id: string, status: SubscriptionStatus): Promise<StoredSubscription> {
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("email_subscriptions")
    .update({ status, status_changed_at: now, ...(status === "unsubscribed" ? { unsubscribed_at: now } : {}) })
    .eq("id", id)
    .select(subscriptionColumns)
    .single();
  if (error) throw new Error(`Could not update the subscription: ${error.message}`);
  return data as StoredSubscription;
}

/** After the user finishes a manual unsubscribe, mark the matching sender unsubscribed. */
export async function markSubscriptionUnsubscribed(context: AuthedContext, accountEmail: string | null, senderKey: string) {
  if (!accountEmail) return;
  const { data: connection } = await context.supabase.from("gmail_connections").select("id").eq("google_email", accountEmail).maybeSingle();
  if (!connection) return;
  const subscription = await getSubscription(context, connection.id, senderKey);
  if (subscription && subscription.status !== "unsubscribed") await setSubscriptionStatus(context, subscription.id, "unsubscribed");
}

/** Re-applies protect/ignore rules to stored senders without rescanning Gmail. */
export async function applyRulesToSubscriptions({ supabase }: AuthedContext, rules: Awaited<ReturnType<typeof listSenderRules>>) {
  const { data, error } = await supabase.from("email_subscriptions").select("id, address, domain, protected_by, ignored").limit(20000);
  if (error) throw new Error(`Could not load subscriptions: ${error.message}`);
  const changes = (data ?? []).flatMap((row) => {
    const protectedBy = row.address ? findRule(rules, "protect", row.address, row.domain)?.matchType ?? null : null;
    const ignored = row.address ? Boolean(findRule(rules, "ignore", row.address, row.domain)) : false;
    return protectedBy !== row.protected_by || ignored !== row.ignored ? [{ id: row.id as string, protected_by: protectedBy, ignored }] : [];
  });
  for (const change of changes) {
    const { error: updateError } = await supabase.from("email_subscriptions").update({ protected_by: change.protected_by, ignored: change.ignored }).eq("id", change.id);
    if (updateError) throw new Error(`Could not apply the sender rule: ${updateError.message}`);
  }
}
