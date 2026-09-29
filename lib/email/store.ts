import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { ScanStats, SenderRule } from "./classifier.ts";
import { decryptSecret, encryptSecret } from "./google-oauth.ts";
import type { UnsubscribeMethod } from "./unsubscribe.ts";
import { PlanLimitError, planLimits, startOfUtcMonth, type Plan, type PlanUsage } from "@/lib/plans";

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
  const plan = await getPlan(context);
  const [unsubscribesThisMonth, accounts] = await Promise.all([countUnsubscribesThisMonth(context), listGmailAccounts(context, plan)]);
  return { plan, limits: planLimits[plan], unsubscribesThisMonth, accountsConnected: accounts.length };
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

/** Most recent attempt per sender key for one Gmail account, so the scan can show what already happened. */
export async function getLatestActionsBySender({ supabase }: AuthedContext, accountEmail: string) {
  const { data, error } = await supabase.from("unsubscribe_actions").select(actionColumns).eq("account_email", accountEmail).order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(`Could not load unsubscribe history: ${error.message}`);
  const latest = new Map<string, Pick<UnsubscribeAction, "id" | "status" | "createdAt">>();
  for (const action of (data ?? []).map(toAction)) {
    if (!latest.has(action.senderKey)) latest.set(action.senderKey, { id: action.id, status: action.status, createdAt: action.createdAt });
  }
  return latest;
}

/** Latest attempt for a sender in one Gmail account, used to avoid repeating a request that already worked. */
export async function getLatestAction({ supabase }: AuthedContext, accountEmail: string, senderKey: string) {
  const { data } = await supabase.from("unsubscribe_actions").select(actionColumns).eq("account_email", accountEmail).eq("sender_key", senderKey).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? toAction(data) : null;
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

/** The user confirms they finished a manual unsubscribe themselves. */
export async function confirmManualAction({ supabase }: AuthedContext, id: string) {
  const { data, error } = await supabase.from("unsubscribe_actions")
    .update({ status: "success", detail: "You confirmed you unsubscribed using the sender's page.", updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "manual_required").select("id");
  if (error) throw new Error(`Could not update the unsubscribe history: ${error.message}`);
  return Boolean(data?.length);
}
