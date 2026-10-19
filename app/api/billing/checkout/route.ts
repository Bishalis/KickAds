import { getOrCreateCustomer, getPremiumPriceId, getStripe, siteUrl } from "@/lib/billing/stripe";
import { jsonError } from "@/lib/email/route-helpers";
import { getAuthedContext, getPlan } from "@/lib/email/store";
import { NextResponse } from "next/server";

/**
 * Starts a Stripe-hosted checkout for Premium. Card details never touch this app, and
 * nothing is granted here: Premium is switched on only by the verified webhook.
 */
export async function POST() {
  const context = await getAuthedContext();
  if (!context) return jsonError("Please sign in.", 401);

  try {
    if (await getPlan(context) === "premium") return jsonError("You're already on Premium.", 409);
    const stripe = getStripe();
    const customer = await getOrCreateCustomer(stripe, context.user);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: context.user.id,
      line_items: [{ price: getPremiumPriceId(), quantity: 1 }],
      subscription_data: { metadata: { userId: context.user.id } },
      metadata: { userId: context.user.id },
      allow_promotion_codes: true,
      success_url: `${siteUrl()}/dashboard/upgrade?checkout=success`,
      cancel_url: `${siteUrl()}/dashboard/upgrade?checkout=cancelled`,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[billing checkout] failed:", error instanceof Error ? error.message : "unknown error");
    return jsonError("Could not start checkout. Please try again.", 500);
  }
}
