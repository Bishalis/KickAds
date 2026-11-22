import { createHmac, randomUUID } from "node:crypto";
import { world } from "../world.ts";

/** Stand-in for the Stripe SDK: just the calls the app makes, with real webhook signatures. */

export function signStripePayload(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

const idempotent = new Map<string, unknown>();

export default class Stripe {

  customers = {
    create: async (params: { email?: string; metadata: Record<string, string> }, options?: { idempotencyKey?: string }) => {
      const key = options?.idempotencyKey;
      if (key && idempotent.has(key)) return idempotent.get(key);
      const customer = { id: `cus_${randomUUID().slice(0, 8)}`, email: params.email, metadata: params.metadata };
      world.stripe.customers.push(customer);
      if (key) idempotent.set(key, customer);
      return customer;
    },
  };

  checkout = {
    sessions: {
      create: async (params: Record<string, unknown>) => {
        const session = { id: `cs_${randomUUID().slice(0, 8)}`, url: "https://checkout.stripe.test/session", ...params };
        world.stripe.checkoutSessions.push(session);
        return session;
      },
    },
  };

  billingPortal = {
    sessions: {
      create: async (params: Record<string, unknown>) => {
        world.stripe.portalSessions.push(params);
        return { url: "https://billing.stripe.test/portal" };
      },
    },
  };

  subscriptions = {
    retrieve: async (id: string) => {
      const subscription = world.stripe.subscriptions.get(id);
      if (!subscription) throw new Error(`No such subscription: ${id}`);
      return structuredClone(subscription);
    },
  };

  webhooks = {
    constructEvent(payload: string, header: string, secret: string) {
      const parts = Object.fromEntries(header.split(",").map((part) => part.split("=") as [string, string]));
      const expected = createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex");
      if (parts.v1 !== expected) throw new Error("No signatures found matching the expected signature for payload");
      return JSON.parse(payload);
    },
  };
}

export function resetStripeIdempotency() {
  idempotent.clear();
}
