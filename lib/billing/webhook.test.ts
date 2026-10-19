import assert from "node:assert/strict";
import test from "node:test";
import Stripe from "stripe";
import { handleStripeEvent, planForSubscriptionStatus, type BillingStore, type PlanUpdate } from "./webhook.ts";

function subscription(id: string, status: string, extra: Partial<Stripe.Subscription> = {}) {
  return {
    id,
    status,
    customer: "cus_1",
    cancel_at_period_end: false,
    metadata: { userId: "user-1" },
    items: { data: [{ current_period_end: 1_800_000_000 }] },
    ...extra,
  } as unknown as Stripe.Subscription;
}

function event(id: string, type: string, object: unknown) {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}

/** In-memory stand-in for the service-role Supabase store. */
function fakeStore(initialSubscriptionId: string | null = null) {
  const events = new Set<string>();
  const saved: Array<{ userId: string; update: PlanUpdate }> = [];
  let subscriptionId = initialSubscriptionId;
  let failNextSave = false;
  const store: BillingStore = {
    async claimEvent(id) {
      if (events.has(id)) return false;
      events.add(id);
      return true;
    },
    async releaseEvent(id) { events.delete(id); },
    async findUserIdByCustomer(customerId) { return customerId === "cus_1" ? "user-1" : null; },
    async getSubscriptionId() { return subscriptionId; },
    async savePlan(userId, update) {
      if (failNextSave) {
        failNextSave = false;
        throw new Error("database unavailable");
      }
      saved.push({ userId, update });
      subscriptionId = update.stripe_subscription_id;
    },
  };
  return { store, saved, events, failSaveOnce: () => { failNextSave = true; } };
}

const source = (sub: Stripe.Subscription) => ({ retrieve: async () => sub });

test("only active, trialing, and past-due subscriptions keep Premium", () => {
  assert.equal(planForSubscriptionStatus("active"), "premium");
  assert.equal(planForSubscriptionStatus("trialing"), "premium");
  assert.equal(planForSubscriptionStatus("past_due"), "premium");
  for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]) {
    assert.equal(planForSubscriptionStatus(status), "free", status);
  }
});

test("a completed checkout upgrades the user, with Stripe ids stored", async () => {
  const { store, saved } = fakeStore();
  const result = await handleStripeEvent(
    event("evt_1", "checkout.session.completed", { mode: "subscription", subscription: "sub_1", client_reference_id: "user-1" }),
    source(subscription("sub_1", "active")),
    store,
  );
  assert.equal(result, "processed");
  assert.deepEqual(saved, [{
    userId: "user-1",
    update: { plan: "premium", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", subscription_status: "active", current_period_end: new Date(1_800_000_000_000).toISOString(), cancel_at_period_end: false },
  }]);
});

test("a redelivered webhook event is applied only once", async () => {
  const { store, saved } = fakeStore();
  const completed = event("evt_dup", "checkout.session.completed", { mode: "subscription", subscription: "sub_1", client_reference_id: "user-1" });
  assert.equal(await handleStripeEvent(completed, source(subscription("sub_1", "active")), store), "processed");
  assert.equal(await handleStripeEvent(completed, source(subscription("sub_1", "active")), store), "duplicate");
  assert.equal(saved.length, 1);
});

test("a failed payment records past_due and keeps Premium while Stripe retries", async () => {
  const { store, saved } = fakeStore("sub_1");
  await handleStripeEvent(
    event("evt_2", "invoice.payment_failed", { parent: { subscription_details: { subscription: "sub_1" } } }),
    source(subscription("sub_1", "past_due")),
    store,
  );
  assert.equal(saved[0].update.subscription_status, "past_due");
  assert.equal(saved[0].update.plan, "premium");
});

test("a cancelled subscription moves the user back to Freemium", async () => {
  const { store, saved } = fakeStore("sub_1");
  await handleStripeEvent(event("evt_3", "customer.subscription.deleted", { id: "sub_1" }), source(subscription("sub_1", "canceled")), store);
  assert.equal(saved[0].update.plan, "free");
  assert.equal(saved[0].update.subscription_status, "canceled");
});

test("a late event for an old, ended subscription doesn't downgrade a newer one", async () => {
  const { store, saved } = fakeStore("sub_new");
  const result = await handleStripeEvent(event("evt_4", "customer.subscription.deleted", { id: "sub_old" }), source(subscription("sub_old", "canceled")), store);
  assert.equal(result, "ignored");
  assert.equal(saved.length, 0);
});

test("a failure releases the event so Stripe's retry is processed", async () => {
  const { store, saved, failSaveOnce } = fakeStore();
  failSaveOnce();
  const completed = event("evt_5", "checkout.session.completed", { mode: "subscription", subscription: "sub_1", client_reference_id: "user-1" });
  await assert.rejects(handleStripeEvent(completed, source(subscription("sub_1", "active")), store));
  assert.equal(await handleStripeEvent(completed, source(subscription("sub_1", "active")), store), "processed");
  assert.equal(saved.length, 1);
});

test("unrelated events are ignored without being recorded", async () => {
  const { store, events } = fakeStore();
  assert.equal(await handleStripeEvent(event("evt_6", "charge.refunded", {}), source(subscription("sub_1", "active")), store), "ignored");
  assert.equal(events.size, 0);
});

test("webhook signatures are verified against the raw body", () => {
  const stripe = new Stripe("sk_test_unused");
  const secret = "whsec_test";
  const payload = JSON.stringify({ id: "evt_7", object: "event", type: "invoice.paid", data: { object: {} } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  assert.equal(stripe.webhooks.constructEvent(payload, header, secret).id, "evt_7");
  assert.throws(() => stripe.webhooks.constructEvent(payload.replace("evt_7", "evt_8"), header, secret));
  assert.throws(() => stripe.webhooks.constructEvent(payload, header, "whsec_wrong"));
});
