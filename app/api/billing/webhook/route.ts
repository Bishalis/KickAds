import { createBillingStore, getStripe } from "@/lib/billing/stripe";
import { handleStripeEvent } from "@/lib/billing/webhook";
import { NextResponse } from "next/server";

/**
 * Stripe webhook: the only place a paid plan is granted or removed. The signature is
 * verified against the raw body before anything is trusted.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    const result = await handleStripeEvent(event, { retrieve: (id) => stripe.subscriptions.retrieve(id) }, createBillingStore());
    return NextResponse.json({ received: true, result });
  } catch (error) {
    // A non-2xx response makes Stripe retry the event later.
    console.error(`[billing webhook] ${event.type} ${event.id} failed:`, error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Webhook handling failed." }, { status: 500 });
  }
}
