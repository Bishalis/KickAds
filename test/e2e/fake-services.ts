/**
 * Fake Google (sign-in, tokens, Gmail API), Stripe (API and hosted checkout), and senders'
 * one-click unsubscribe endpoints for the browser tests. The app talks to this server
 * instead of the real services when started with KICKADS_E2E=1 (see lib/test-hooks.ts).
 *
 * Tests control it through /__test/* endpoints: set up mailboxes, choose what the next
 * Google consent screen does, and choose how one-click requests are answered.
 *
 *   node --experimental-strip-types test/e2e/fake-services.ts
 */
import { createHmac, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { listPage, messageResource } from "../support/gmail-model.ts";
import type { FakeMessage } from "../support/world.ts";

const port = Number(process.env.FAKE_SERVICES_PORT ?? 4100);
const base = `http://127.0.0.1:${port}`;
const appUrl = process.env.APP_URL ?? "http://localhost:3100";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_e2e";
const gmailScope = "https://www.googleapis.com/auth/gmail.readonly";

type Account = { email: string; refreshToken: string; accessToken: string; messages: FakeMessage[] };
type Subscription = { id: string; object: "subscription"; status: string; customer: string; cancel_at_period_end: boolean; metadata: Record<string, string>; items: { object: "list"; data: Array<{ current_period_end: number }> } };

function freshState() {
  return {
    accounts: new Map<string, Account>(),
    nextConsent: null as { email: string; deny?: boolean; scope?: string } | null,
    codes: new Map<string, { account: Account; scope: string }>(),
    oneClickStatus: 200,
    oneClickCalls: [] as string[],
    checkoutSessions: new Map<string, Record<string, string>>(),
    subscriptions: new Map<string, Subscription>(),
  };
}
let state = freshState();

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function send(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(typeof body === "string" ? body : JSON.stringify(body));
}

function redirect(response: ServerResponse, location: string) {
  response.writeHead(302, { location });
  response.end();
}

function accountByAccessToken(request: IncomingMessage) {
  const token = request.headers.authorization?.replace(/^Bearer /, "");
  return [...state.accounts.values()].find((account) => account.accessToken === token);
}

/** Pays for a checkout session: creates the subscription and sends Stripe's signed webhook. */
async function completeCheckout(sessionId: string) {
  const session = state.checkoutSessions.get(sessionId)!;
  const subscription: Subscription = {
    id: `sub_${randomUUID().slice(0, 8)}`,
    object: "subscription",
    status: "active",
    customer: session.customer,
    cancel_at_period_end: false,
    metadata: { userId: session.client_reference_id },
    items: { object: "list", data: [{ current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400 }] },
  };
  state.subscriptions.set(subscription.id, subscription);
  const payload = JSON.stringify({
    id: `evt_${randomUUID().slice(0, 8)}`,
    object: "event",
    type: "checkout.session.completed",
    data: { object: { id: sessionId, object: "checkout.session", mode: "subscription", subscription: subscription.id, customer: session.customer, client_reference_id: session.client_reference_id } },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", webhookSecret).update(`${timestamp}.${payload}`).digest("hex");
  try {
    const delivered = await fetch(`${appUrl}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${signature}` }, body: payload });
    if (!delivered.ok) console.error(`Fake Stripe: the app answered the webhook with HTTP ${delivered.status}`);
  } catch (error) {
    // Like real Stripe, a failed delivery doesn't stop the customer returning to the app.
    console.error("Fake Stripe: could not deliver the webhook:", error instanceof Error ? error.message : error);
  }
}

async function handle(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", base);
  const path = url.pathname;
  const method = request.method ?? "GET";

  // ---- Test controls ----
  if (path === "/__test/health") return send(response, 200, { ok: true });
  if (path === "/__test/reset" && method === "POST") { state = freshState(); return send(response, 200, { ok: true }); }
  if (path === "/__test/accounts" && method === "POST") {
    const { email, messages } = JSON.parse(await readBody(request)) as { email: string; messages: FakeMessage[] };
    state.accounts.set(email, { email, messages, refreshToken: `refresh-${randomUUID()}`, accessToken: `access-${randomUUID()}` });
    return send(response, 200, { ok: true });
  }
  if (path === "/__test/next-consent" && method === "POST") { state.nextConsent = JSON.parse(await readBody(request)); return send(response, 200, { ok: true }); }
  if (path === "/__test/one-click" && method === "POST") { state.oneClickStatus = JSON.parse(await readBody(request)).status; return send(response, 200, { ok: true }); }
  if (path === "/__test/state") return send(response, 200, { oneClickCalls: state.oneClickCalls });

  // ---- Google sign-in: the consent screen approves (or denies) straight away ----
  if (path === "/o/oauth2/v2/auth") {
    const target = new URL(url.searchParams.get("redirect_uri")!);
    target.searchParams.set("state", url.searchParams.get("state") ?? "");
    const consent = state.nextConsent;
    const account = consent && state.accounts.get(consent.email);
    if (!consent || consent.deny || !account) {
      target.searchParams.set("error", "access_denied");
    } else {
      const code = `code-${randomUUID()}`;
      state.codes.set(code, { account, scope: consent.scope ?? gmailScope });
      target.searchParams.set("code", code);
    }
    return redirect(response, target.toString());
  }
  if (path === "/token" && method === "POST") {
    const params = new URLSearchParams(await readBody(request));
    if (params.get("grant_type") === "authorization_code") {
      const grant = state.codes.get(params.get("code") ?? "");
      if (!grant) return send(response, 400, { error: "invalid_grant" });
      state.codes.delete(params.get("code")!);
      return send(response, 200, { access_token: grant.account.accessToken, refresh_token: grant.account.refreshToken, scope: grant.scope, token_type: "Bearer", expires_in: 3600 });
    }
    const account = [...state.accounts.values()].find((item) => item.refreshToken === params.get("refresh_token"));
    if (!account) return send(response, 400, { error: "invalid_grant" });
    return send(response, 200, { access_token: account.accessToken, scope: gmailScope, token_type: "Bearer", expires_in: 3600 });
  }
  if (path === "/revoke") return send(response, 200, {});

  // ---- Gmail API (read-only) ----
  if (path.startsWith("/gmail/v1/users/me/")) {
    const account = accountByAccessToken(request);
    if (!account) return send(response, 401, { error: { code: 401, status: "UNAUTHENTICATED", errors: [{ reason: "authError" }] } });
    if (path === "/gmail/v1/users/me/profile") return send(response, 200, { emailAddress: account.email });
    if (path === "/gmail/v1/users/me/messages") {
      return send(response, 200, listPage(account.messages, url.searchParams.get("q") ?? undefined, url.searchParams.get("pageToken") ?? undefined, Number(url.searchParams.get("maxResults") ?? 100)));
    }
    const id = path.match(/^\/gmail\/v1\/users\/me\/messages\/([^/]+)$/)?.[1];
    const message = id && account.messages.find((item) => item.id === id);
    if (method === "GET" && message) return send(response, 200, messageResource(message, url.searchParams.get("format") ?? undefined, url.searchParams.getAll("metadataHeaders")));
    return send(response, 404, { error: { code: 404, status: "NOT_FOUND" } });
  }

  // ---- Stripe API ----
  if (path === "/v1/customers" && method === "POST") {
    const params = new URLSearchParams(await readBody(request));
    return send(response, 200, { id: `cus_${randomUUID().slice(0, 8)}`, object: "customer", email: params.get("email") });
  }
  if (path === "/v1/checkout/sessions" && method === "POST") {
    const params = Object.fromEntries(new URLSearchParams(await readBody(request)));
    const id = `cs_${randomUUID().slice(0, 8)}`;
    state.checkoutSessions.set(id, params);
    return send(response, 200, { id, object: "checkout.session", url: `${base}/checkout/${id}` });
  }
  if (path === "/v1/billing_portal/sessions" && method === "POST") return send(response, 200, { id: "bps_1", object: "billing_portal.session", url: `${base}/portal` });
  const subscriptionId = path.match(/^\/v1\/subscriptions\/([^/]+)$/)?.[1];
  if (subscriptionId) {
    const subscription = state.subscriptions.get(subscriptionId);
    return subscription ? send(response, 200, subscription) : send(response, 404, { error: { type: "invalid_request_error", message: "No such subscription" } });
  }

  // ---- Stripe-hosted pages ----
  const checkoutId = path.match(/^\/checkout\/([^/]+)$/)?.[1];
  if (checkoutId && state.checkoutSessions.has(checkoutId)) {
    await completeCheckout(checkoutId);
    return redirect(response, state.checkoutSessions.get(checkoutId)!.success_url);
  }
  if (path === "/portal") return send(response, 200, "<h1>Fake billing portal</h1>", { "content-type": "text/html" });

  // ---- Senders' one-click unsubscribe endpoints (".test" hosts) ----
  if (path.startsWith("/one-click/") && method === "POST") {
    state.oneClickCalls.push(path.slice("/one-click/".length));
    return send(response, state.oneClickStatus, {});
  }

  // ---- Stand-in Supabase when no test project is configured: nobody is ever signed in ----
  if (path.startsWith("/supabase/")) return send(response, 401, { message: "No test Supabase project configured" });

  return send(response, 404, { error: `Fake services: no route for ${method} ${path}` });
}

createServer((request, response) => {
  handle(request, response).catch((error) => send(response, 500, { error: String(error) }));
}).listen(port, "127.0.0.1", () => console.log(`Fake services listening on ${base}`));
