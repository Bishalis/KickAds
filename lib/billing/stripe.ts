import "server-only";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BillingStore } from "./webhook.ts";

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return new Stripe(key);
}

export function getPremiumPriceId() {
  const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
  if (!priceId) throw new Error("STRIPE_PREMIUM_PRICE_ID is not configured.");
  return priceId;
}

export function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/** Billing writes go through the service role: users can read their plan but never change it. */
export function createBillingStore(): BillingStore {
  const admin = createAdminClient();
  return {
    async claimEvent(id, type) {
      const { error } = await admin.from("stripe_events").insert({ id, type });
      if (error?.code === "23505") return false;
      if (error) throw new Error(`Could not record Stripe event: ${error.message}`);
      return true;
    },
    async releaseEvent(id) {
      await admin.from("stripe_events").delete().eq("id", id);
    },
    async findUserIdByCustomer(customerId) {
      const { data } = await admin.from("user_plans").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
      return data?.user_id ?? null;
    },
    async getSubscriptionId(userId) {
      const { data } = await admin.from("user_plans").select("stripe_subscription_id").eq("user_id", userId).maybeSingle();
      return data?.stripe_subscription_id ?? null;
    },
    async savePlan(userId, update) {
      const { error } = await admin.from("user_plans").upsert({ user_id: userId, ...update, updated_at: new Date().toISOString() });
      if (error) throw new Error(`Could not save the plan: ${error.message}`);
    },
  };
}

/** The user's Stripe customer, created on first checkout and remembered on their plan row. */
export async function getOrCreateCustomer(stripe: Stripe, user: { id: string; email?: string | null }) {
  const admin = createAdminClient();
  const { data } = await admin.from("user_plans").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (data?.stripe_customer_id) return data.stripe_customer_id as string;

  const customer = await stripe.customers.create(
    { email: user.email ?? undefined, metadata: { userId: user.id } },
    // Two quick clicks create one customer, not two.
    { idempotencyKey: `customer-${user.id}` },
  );
  const { error } = await admin.from("user_plans").upsert({ user_id: user.id, stripe_customer_id: customer.id, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Could not save the Stripe customer: ${error.message}`);
  return customer.id;
}
