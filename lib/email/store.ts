import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { ScanStats, SenderRule } from "./classifier.ts";
import { decryptSecret, encryptSecret } from "./google-oauth.ts";
import type { UnsubscribeMethod } from "./unsubscribe.ts";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AuthedContext = { supabase: Supabase; user: User };

/** Resolves the signed-in user; every query below then runs under their RLS policies. */
export async function getAuthedContext(): Promise<AuthedContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

export type GmailConnection = {
  googleEmail: string;
  refreshToken: string;
  lastScanAt: string | null;
  lastScanStats: ScanStats | null;
};

export async function getGmailConnection({ supabase, user }: AuthedContext): Promise<GmailConnection | null> {
  const { data, error } = await supabase
    .from("gmail_connections")
    .select("google_email, encrypted_refresh_token, last_scan_at, last_scan_stats")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Could not load the Gmail connection: ${error.message}`);
  if (!data) return null;
  const refreshToken = decryptSecret(data.encrypted_refresh_token);
  if (!refreshToken) return null;
  return {
    googleEmail: data.google_email,
    refreshToken,
    lastScanAt: data.last_scan_at,
    lastScanStats: data.last_scan_stats,
  };
}

export async function saveGmailConnection({ supabase, user }: AuthedContext, connection: { googleEmail: string; refreshToken: string; scopes: string }) {
  const { error } = await supabase.from("gmail_connections").upsert({
    user_id: user.id,
    google_email: connection.googleEmail,
    encrypted_refresh_token: encryptSecret(connection.refreshToken),
    scopes: connection.scopes,
    connected_at: new Date().toISOString(),
    last_scan_at: null,
    last_scan_stats: null,
  });
  if (error) throw new Error(`Could not save the Gmail connection: ${error.message}`);
}

export async function deleteGmailConnection({ supabase, user }: AuthedContext) {
  const { error } = await supabase.from("gmail_connections").delete().eq("user_id", user.id);
  if (error) throw new Error(`Could not remove the Gmail connection: ${error.message}`);
}

export async function saveScanStats({ supabase, user }: AuthedContext, stats: ScanStats) {
  await supabase.from("gmail_connections").update({ last_scan_at: new Date().toISOString(), last_scan_stats: stats }).eq("user_id", user.id);
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

const actionColumns = "id, sender_key, sender_address, sender_domain, display_name, method, status, detail, created_at, updated_at";

function toAction(row: Record<string, string>): UnsubscribeAction {
  return {
    id: row.id,
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

/** Most recent attempt per sender key, so the scan can show what already happened. */
export async function getLatestActionsBySender(context: AuthedContext) {
  const latest = new Map<string, Pick<UnsubscribeAction, "id" | "status" | "createdAt">>();
  for (const action of await listUnsubscribeActions(context, 500)) {
    if (!latest.has(action.senderKey)) latest.set(action.senderKey, { id: action.id, status: action.status, createdAt: action.createdAt });
  }
  return latest;
}

/** Latest attempt for a sender, used to avoid repeating a request that already worked. */
export async function getLatestAction({ supabase }: AuthedContext, senderKey: string) {
  const { data } = await supabase.from("unsubscribe_actions").select(actionColumns).eq("sender_key", senderKey).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? toAction(data) : null;
}

/** Inserts a pending attempt. Returns null when another attempt for this sender is already in flight. */
export async function startUnsubscribeAction({ supabase, user }: AuthedContext, action: { senderKey: string; senderAddress: string; senderDomain: string; displayName: string; listId: string | null; method: UnsubscribeMethod; targetHost: string | null }) {
  // A pending row older than two minutes belongs to a request that crashed; close it out.
  await supabase.from("unsubscribe_actions")
    .update({ status: "failed", detail: "The request did not finish.", updated_at: new Date().toISOString() })
    .eq("sender_key", action.senderKey).eq("status", "pending").lt("created_at", new Date(Date.now() - 120_000).toISOString());

  const { data, error } = await supabase.from("unsubscribe_actions").insert({
    user_id: user.id,
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
