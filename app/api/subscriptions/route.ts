import { handleRouteError, jsonError } from "@/lib/email/route-helpers";
import { countSubscriptionTabs, getAuthedContext, getPlan, listGmailAccounts, listSubscriptions } from "@/lib/email/store";
import { subscriptionTabs, toSubscriptionView, type SubscriptionTab } from "@/lib/email/subscriptions";
import { NextResponse } from "next/server";

/**
 * Stored senders for one account and one tab, read from the database: opening a page never
 * rescans Gmail. Protected senders are only returned for the "protected" tab.
 */
export async function GET(request: Request) {
  const context = await getAuthedContext();
  if (!context) return jsonError("Please sign in.", 401);

  const params = new URL(request.url).searchParams;
  const tab = (params.get("tab") ?? "subscription") as SubscriptionTab;
  if (!subscriptionTabs.includes(tab)) return jsonError("Unknown list.", 400);

  try {
    const plan = await getPlan(context);
    const accounts = await listGmailAccounts(context, plan);
    const requested = params.get("accountId");
    const account = requested ? accounts.find((item) => item.id === requested) : accounts.find((item) => !item.locked);
    if (requested && !account) return jsonError("That Gmail account isn't connected.", 404);
    if (!account || account.locked) {
      return NextResponse.json({ plan, accounts, account: account ?? null, counts: null, subscriptions: [] });
    }

    const [rows, counts] = await Promise.all([listSubscriptions(context, account.id, tab), countSubscriptionTabs(context, account.id)]);
    return NextResponse.json({ plan, accounts, account, counts, subscriptions: rows.map(toSubscriptionView) });
  } catch (error) {
    return handleRouteError(error, context, "load your subscriptions");
  }
}
