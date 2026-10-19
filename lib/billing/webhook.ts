import type Stripe from "stripe";
import type { Plan } from "../plans.ts";

/** Subscription states that keep Premium. past_due keeps access while Stripe retries the card. */
const premiumStatuses = new Set<string>(["active", "trialing", "past_due"]);

export function planForSubscriptionStatus(status: string): Plan {
  return premiumStatuses.has(status) ? "premium" : "free";
}

export type PlanUpdate = {
  plan: Plan;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  subscription_status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export function toPlanUpdate(subscription: Stripe.Subscription): PlanUpdate {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const periodEnd = subscription.items.data[0]?.current_period_end;
  return {
    plan: planForSubscriptionStatus(subscription.status),
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
  };
}

/** Storage the webhook needs; implemented with the Supabase service role in production. */
export type BillingStore = {
  /** Records the event id; returns false if it was already handled (a redelivery). */
  claimEvent(id: string, type: string): Promise<boolean>;
  /** Forgets a claimed event after a failure, so Stripe's retry is processed. */
  releaseEvent(id: string): Promise<void>;
  findUserIdByCustomer(customerId: string): Promise<string | null>;
  getSubscriptionId(userId: string): Promise<string | null>;
  savePlan(userId: string, update: PlanUpdate): Promise<void>;
};

export type SubscriptionSource = { retrieve(id: string): Promise<Stripe.Subscription> };

const handledTypes = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

function idOf(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

/**
 * Applies one verified Stripe event. Every handler re-reads the subscription from Stripe
 * and stores its current state, so events arriving late or out of order can't leave a
 * stale plan, and a redelivered event is skipped by its id.
 */
export async function handleStripeEvent(event: Stripe.Event, subscriptions: SubscriptionSource, store: BillingStore): Promise<"processed" | "duplicate" | "ignored"> {
  if (!handledTypes.has(event.type)) return "ignored";
  if (!await store.claimEvent(event.id, event.type)) return "duplicate";

  try {
    let subscriptionId: string | null = null;
    let userId: string | null = null;

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") return "ignored";
      subscriptionId = idOf(session.subscription);
      userId = session.client_reference_id ?? session.metadata?.userId ?? null;
    } else if (event.type.startsWith("customer.subscription.")) {
      subscriptionId = (event.data.object as Stripe.Subscription).id;
    } else {
      subscriptionId = idOf((event.data.object as Stripe.Invoice).parent?.subscription_details?.subscription);
    }
    if (!subscriptionId) return "ignored";

    const subscription = await subscriptions.retrieve(subscriptionId);
    const update = toPlanUpdate(subscription);
    userId ??= subscription.metadata?.userId ?? await store.findUserIdByCustomer(update.stripe_customer_id);
    if (!userId) throw new Error(`No user for Stripe customer ${update.stripe_customer_id}`);

    // An old, ended subscription must not downgrade a user who has since subscribed again.
    const current = await store.getSubscriptionId(userId);
    if (current && current !== subscription.id && update.plan === "free") return "ignored";

    await store.savePlan(userId, update);
    return "processed";
  } catch (error) {
    await store.releaseEvent(event.id);
    throw error;
  }
}
