// Scenarios section 9: upgrading and billing with Stripe.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { POST as checkoutRoute } from "../../app/api/billing/checkout/route.ts";
import { POST as portalRoute } from "../../app/api/billing/portal/route.ts";
import { POST as webhookRoute } from "../../app/api/billing/webhook/route.ts";
import { GET as planRoute } from "../../app/api/plan/route.ts";
import { call, createUser, reset, sendStripeEvent, setPlan, signIn, stripeSubscription } from "../support/app.ts";
import { createClient } from "../support/fakes/supabase-server.ts";
import { rows } from "../support/fakes/db.ts";
import { world, type FakeUser } from "../support/world.ts";

let user: FakeUser;

beforeEach(() => {
  reset();
  user = createUser();
  signIn(user);
});

const checkout = () => call(checkoutRoute, { method: "POST", path: "/api/billing/checkout" });
const plan = async () => (await call(planRoute, { path: "/api/plan" })).body;

/** Checkout plus the webhook Stripe sends when the payment succeeds. */
async function pay(status = "active") {
  await checkout();
  const customer = String(rows("user_plans").find((row) => row.user_id === user.id)!.stripe_customer_id);
  stripeSubscription("sub_1", status, customer, user.id);
  const result = await sendStripeEvent({ id: "evt_paid", type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_1", client_reference_id: user.id } } });
  return { customer, result };
}

describe("checkout", () => {
  test("requires signing in", async () => {
    world.session = null;
    assert.equal((await checkout()).status, 401);
  });

  test("creates a Stripe-hosted checkout for this user's Premium subscription", async () => {
    const result = await checkout();
    assert.equal(result.status, 200);
    assert.equal(result.body.url, "https://checkout.stripe.test/session");
    const [session] = world.stripe.checkoutSessions;
    assert.equal(session.mode, "subscription");
    assert.equal(session.client_reference_id, user.id);
    assert.deepEqual(session.line_items, [{ price: "price_premium_test", quantity: 1 }]);
    assert.equal(session.success_url, "http://localhost:3000/dashboard/upgrade?checkout=success");
  });

  test("reuses the same Stripe customer on repeat attempts", async () => {
    await checkout();
    await checkout();
    assert.equal(world.stripe.customers.length, 1);
    assert.equal(new Set(world.stripe.checkoutSessions.map((session) => session.customer)).size, 1);
  });

  test("alone does not grant Premium", async () => {
    await checkout();
    assert.equal((await plan()).plan, "free");
  });

  test("is refused for users who are already Premium", async () => {
    setPlan(user, "premium");
    const result = await checkout();
    assert.equal(result.status, 409);
    assert.equal(result.body.error, "You're already on Premium.");
  });
});

describe("webhook", () => {
  test("refuses requests without a valid Stripe signature", async () => {
    const unsigned = await call(webhookRoute, { method: "POST", path: "/api/billing/webhook", body: { id: "evt_x", type: "checkout.session.completed" } });
    assert.equal(unsigned.status, 400);
    const forged = await sendStripeEvent({ id: "evt_x", type: "checkout.session.completed", data: { object: {} } }, "whsec_wrong");
    assert.equal(forged.status, 400);
    assert.equal(forged.body.error, "Invalid signature.");
  });

  test("a successful payment upgrades the user to Premium", async () => {
    const { result } = await pay();
    assert.equal(result.status, 200);
    assert.equal(result.body.result, "processed");
    const current = await plan();
    assert.equal(current.plan, "premium");
    assert.equal(current.billing.subscriptionStatus, "active");
    assert.equal(current.billing.hasBillingAccount, true);
  });

  test("a redelivered event is applied only once", async () => {
    await pay();
    const again = await sendStripeEvent({ id: "evt_paid", type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_1", client_reference_id: user.id } } });
    assert.equal(again.status, 200);
    assert.equal(again.body.result, "duplicate");
    assert.equal(rows("stripe_events").length, 1);
  });

  test("a failed payment marks the subscription past due but keeps Premium while Stripe retries", async () => {
    const { customer } = await pay();
    stripeSubscription("sub_1", "past_due", customer, user.id);
    await sendStripeEvent({ id: "evt_failed", type: "invoice.payment_failed", data: { object: { parent: { subscription_details: { subscription: "sub_1" } } } } });
    const current = await plan();
    assert.equal(current.plan, "premium");
    assert.equal(current.billing.subscriptionStatus, "past_due");
  });

  test("cancelling at the end of the period is shown, then ending moves the user to Freemium", async () => {
    const { customer } = await pay();
    const subscription = stripeSubscription("sub_1", "active", customer, user.id);
    subscription.cancel_at_period_end = true;
    await sendStripeEvent({ id: "evt_cancel", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } });
    assert.equal((await plan()).billing.cancelAtPeriodEnd, true);

    stripeSubscription("sub_1", "canceled", customer, user.id);
    await sendStripeEvent({ id: "evt_ended", type: "customer.subscription.deleted", data: { object: { id: "sub_1" } } });
    assert.equal((await plan()).plan, "free");
  });
});

describe("billing portal", () => {
  test("is unavailable before the user has a billing account", async () => {
    const result = await call(portalRoute, { method: "POST", path: "/api/billing/portal" });
    assert.equal(result.status, 404);
  });

  test("opens Stripe's portal for the user's own customer", async () => {
    const { customer } = await pay();
    const result = await call(portalRoute, { method: "POST", path: "/api/billing/portal" });
    assert.equal(result.body.url, "https://billing.stripe.test/portal");
    assert.equal(world.stripe.portalSessions[0].customer, customer);
  });
});

test("a user can't upgrade themselves by writing to the database directly", async () => {
  const supabase = await createClient();
  await supabase.from("user_plans").insert({ user_id: user.id, plan: "premium" });
  await supabase.from("user_plans").update({ plan: "premium" }).eq("user_id", user.id);
  assert.equal((await plan()).plan, "free");
});
