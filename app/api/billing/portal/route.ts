import { getStripe, siteUrl } from "@/lib/billing/stripe";
import { jsonError } from "@/lib/email/route-helpers";
import { getAuthedContext } from "@/lib/email/store";
import { NextResponse } from "next/server";

/** Opens Stripe's hosted billing portal to update the card, see invoices, or cancel. */
export async function POST() {
  const context = await getAuthedContext();
  if (!context) return jsonError("Please sign in.", 401);

  try {
    const { data } = await context.supabase.from("user_plans").select("stripe_customer_id").eq("user_id", context.user.id).maybeSingle();
    if (!data?.stripe_customer_id) return jsonError("There's no billing account for you yet.", 404);
    const session = await getStripe().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${siteUrl()}/dashboard/upgrade`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[billing portal] failed:", error instanceof Error ? error.message : "unknown error");
    return jsonError("Could not open billing. Please try again.", 500);
  }
}
