import { randomUUID } from "node:crypto";
import { GET as connectRoute } from "../../app/api/gmail/connect/route.ts";
import { GET as callbackRoute } from "../../app/api/gmail/callback/route.ts";
import { POST as scanRoute } from "../../app/api/gmail/route.ts";
import { GET as subscriptionsRoute } from "../../app/api/subscriptions/route.ts";
import { POST as webhookRoute } from "../../app/api/billing/webhook/route.ts";
import { gmailReadonlyScope } from "../../lib/email/google-oauth.ts";
import { rows } from "./fakes/db.ts";
import { resetStripeIdempotency, signStripePayload } from "./fakes/stripe.ts";
import { resetWorld, world, type FakeGoogleAccount, type FakeMessage, type FakeUser } from "./world.ts";

/** Fresh, empty world before each test. */
export function reset() {
  resetWorld();
  resetStripeIdempotency();
}

// ---- Users and plans ----

export function createUser(email = `user-${randomUUID().slice(0, 6)}@kickads.test`, password = "correct-horse"): FakeUser {
  const user = { id: randomUUID(), email, password };
  world.users.push(user);
  return user;
}

export function signIn(user: FakeUser) {
  world.session = user.id;
}

export function signOut() {
  world.session = null;
}

/** What the SQL editor (or the Stripe webhook) does to change someone's plan. */
export function setPlan(user: FakeUser, plan: "free" | "premium") {
  const existing = rows("user_plans").find((row) => row.user_id === user.id);
  if (existing) existing.plan = plan;
  else rows("user_plans").push({ user_id: user.id, plan, updated_at: new Date().toISOString(), stripe_customer_id: null, stripe_subscription_id: null, subscription_status: null, current_period_end: null, cancel_at_period_end: false });
}

// ---- Calling routes ----

type Handler = (request: Request) => Promise<Response>;

// Response bodies differ per route, and each test checks the fields it cares about.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CallResult = { status: number; body: any; location: string | null };

/** Calls a real route handler the way the browser would. */
export async function call(handler: Handler, options: { method?: string; path: string; body?: unknown; headers?: Record<string, string> }): Promise<CallResult> {
  const { method = "GET", path, body, headers = {} } = options;
  const init: RequestInit = { method, headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers } };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  const response = await handler(new Request(`http://localhost:3000${path}`, init));
  const text = await response.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { json = text || null; }
  return { status: response.status, body: json, location: response.headers.get("location") };
}

/** Runs a server action and returns where it redirected to, or its returned state. */
export async function runAction<T>(action: () => Promise<T>): Promise<{ redirect: string | null; state: T | null }> {
  try {
    return { redirect: null, state: await action() };
  } catch (error) {
    const digest = (error as { digest?: string }).digest;
    if (digest?.startsWith("NEXT_REDIRECT")) return { redirect: digest.split(";")[2], state: null };
    throw error;
  }
}

export function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

// ---- Gmail mailboxes (message builders live in mail.ts, shared with the browser tests) ----

export { mail, newsletter, sentTo, verifiedBy } from "./mail.ts";

export function addGoogleAccount(email: string, messages: FakeMessage[] = []): FakeGoogleAccount {
  const account = { email, refreshToken: `refresh-${randomUUID()}`, messages, revoked: false };
  world.google.accounts.push(account);
  return account;
}

// ---- Connecting Gmail and scanning ----

/**
 * Clicks "Connect Gmail", approves on the fake Google consent screen, and returns the
 * callback's response. `scope` is what the user approved.
 */
export async function connectGmail(account: FakeGoogleAccount, options: { scope?: string; denied?: boolean } = {}) {
  const start = await call(connectRoute, { path: "/api/gmail/connect" });
  if (!start.location?.startsWith("https://accounts.google.test")) return start;
  const state = new URL(start.location).searchParams.get("state")!;
  if (options.denied) return call(callbackRoute, { path: `/api/gmail/callback?state=${state}&error=access_denied` });
  const code = `code-${randomUUID()}`;
  world.google.codes.set(code, { account, scope: options.scope ?? gmailReadonlyScope });
  return call(callbackRoute, { path: `/api/gmail/callback?state=${encodeURIComponent(state)}&code=${code}` });
}

export function connectionFor(account: FakeGoogleAccount) {
  return rows("gmail_connections").find((row) => row.google_email === account.email);
}

/** Runs a whole scan the way the Subscriptions page does: batch after batch until done. */
export async function scan(accountId?: string) {
  const batches: CallResult[] = [];
  let cursor: string | undefined;
  for (;;) {
    const result = await call(scanRoute, { method: "POST", path: "/api/gmail", body: { accountId, cursor } });
    batches.push(result);
    if (result.status !== 200 || result.body.done) return { final: result, batches };
    cursor = result.body.cursor;
  }
}

/**
 * Simulates a minute passing since the last scan, so the next scan isn't refused by the
 * 15-second gap and its results are newer than the stored ones.
 */
export function allowRescan() {
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  for (const row of rows("gmail_connections")) row.last_scan_at = minuteAgo;
  for (const row of rows("email_subscriptions")) row.last_seen_at = minuteAgo;
}

export async function list(tab: "subscription" | "review" | "ignored" | "protected" = "subscription", accountId?: string) {
  const params = new URLSearchParams({ tab });
  if (accountId) params.set("accountId", accountId);
  return call(subscriptionsRoute, { path: `/api/subscriptions?${params}` });
}

export function keysIn(result: CallResult): string[] {
  return result.body.subscriptions.map((sender: { address: string }) => sender.address);
}

/** A user with Gmail connected and scanned, ready for unsubscribe and rule tests. */
export async function userWithMailbox(messages: FakeMessage[], plan: "free" | "premium" = "free") {
  const user = createUser();
  signIn(user);
  if (plan === "premium") setPlan(user, plan);
  const account = addGoogleAccount(`${user.email.split("@")[0]}@gmail.test`, messages);
  await connectGmail(account);
  await scan();
  return { user, account };
}

// ---- Stripe ----

export async function sendStripeEvent(event: Record<string, unknown>, secret = process.env.STRIPE_WEBHOOK_SECRET!) {
  const payload = JSON.stringify(event);
  return call(webhookRoute, { method: "POST", path: "/api/billing/webhook", body: payload, headers: { "content-type": "application/json", "stripe-signature": signStripePayload(payload, secret) } });
}

export function stripeSubscription(id: string, status: string, customer: string, userId: string) {
  const subscription = { id, status, customer, cancel_at_period_end: false, metadata: { userId }, items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400 }] } };
  world.stripe.subscriptions.set(id, subscription);
  return subscription;
}
