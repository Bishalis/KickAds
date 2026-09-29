import { buildSenderGroups, evaluateUnsubscribe, type SenderGroup } from "@/lib/email/classifier";
import { createGmailClient, scanSender } from "@/lib/email/gmail";
import { handleRouteError, jsonError } from "@/lib/email/route-helpers";
import { sendOneClickUnsubscribe } from "@/lib/email/safe-fetch";
import { isValidEmailAddress } from "@/lib/email/sender";
import {
  countRecentActions,
  countUnsubscribesThisMonth,
  finishUnsubscribeAction,
  getAuthedContext,
  getGmailConnection,
  getLatestAction,
  getPlan,
  listSenderRules,
  recordUnsubscribeAction,
  recordUnsubscribeUsage,
  startUnsubscribeAction,
  type AuthedContext,
} from "@/lib/email/store";
import { planLimits } from "@/lib/plans";
import { NextResponse } from "next/server";

export const maxDuration = 30;

const maxActionsPer10Minutes = 30;

function targetHost(url?: string, mailto?: string) {
  if (url) return new URL(url).hostname;
  return mailto?.replace(/^mailto:/, "").split("?")[0].split("@")[1] ?? null;
}

export async function POST(request: Request) {
  const context = await getAuthedContext();
  if (!context) return jsonError("Please sign in.", 401);

  const body = await request.json().catch(() => null) as { accountId?: unknown; key?: unknown; confirmed?: unknown; acknowledgeReview?: unknown } | null;
  const accountId = typeof body?.accountId === "string" ? body.accountId : null;
  const key = typeof body?.key === "string" && body.key.length <= 600 ? body.key : "";
  const address = key.split("|")[0];
  if (!isValidEmailAddress(address)) return jsonError("Choose a sender to unsubscribe from.", 400);
  if (body?.confirmed !== true) return jsonError("Explicit confirmation is required.", 400);

  let connectionId: string | undefined;
  try {
    if (await countRecentActions(context, 10 * 60_000) >= maxActionsPer10Minutes) {
      return jsonError("Too many unsubscribes in a short time. Please wait a few minutes.", 429);
    }
    const plan = await getPlan(context);
    const monthlyLimit = planLimits[plan].monthlyUnsubscribes;
    if (monthlyLimit !== null && await countUnsubscribesThisMonth(context) >= monthlyLimit) {
      return jsonError(`You've used all ${monthlyLimit} unsubscribes included in ${planLimits[plan].label} this month. Upgrade to Premium for unlimited unsubscribes.`, 403, { upgradeRequired: true });
    }
    const connection = await getGmailConnection(context, plan, accountId);
    if (!connection) return jsonError("Gmail is not connected.", 400, { gmailConnected: false });
    connectionId = connection.id;

    // Re-derive the sender from Gmail right now; never trust a URL or classification from the browser.
    const gmail = createGmailClient(connection.refreshToken);
    const [{ messages, correspondents }, rules] = await Promise.all([scanSender(gmail, address), listSenderRules(context)]);
    const group = buildSenderGroups(messages, { rules, correspondents }).find((item) => item.key === key);
    if (!group) return jsonError("No recent email from this sender was found in your connected Gmail.", 404);

    const decision = evaluateUnsubscribe(group, { confirmed: true, acknowledgeReview: body.acknowledgeReview === true });
    if (decision.outcome === "blocked") return jsonError(decision.reason, 409);

    const latest = await getLatestAction(context, connection.googleEmail, key);
    if (latest?.status === "success" && Date.parse(latest.createdAt) >= group.lastReceivedAt) {
      return NextResponse.json({ status: "success", actionId: latest.id, detail: "You already unsubscribed, and no new email from this sender has arrived since." });
    }

    return NextResponse.json(await execute(context, connection.googleEmail, group, decision));
  } catch (error) {
    return handleRouteError(error, context, "unsubscribe", connectionId);
  }
}

async function execute(
  context: AuthedContext,
  accountEmail: string,
  group: SenderGroup,
  decision: Exclude<ReturnType<typeof evaluateUnsubscribe>, { outcome: "blocked" }>,
) {
  const record = {
    accountEmail,
    senderKey: group.key,
    senderAddress: group.address,
    senderDomain: group.domain,
    displayName: group.displayName,
    listId: group.listId,
    method: group.unsubscribe.method,
    targetHost: targetHost(group.unsubscribe.url, group.unsubscribe.mailto),
  };

  if (decision.outcome === "no_method") {
    const detail = "No unsubscribe option was found for this sender. You could filter or block it in Gmail instead.";
    const actionId = await recordUnsubscribeAction(context, record, { status: "no_method", detail });
    return { status: "no_method", actionId, detail };
  }

  if (decision.outcome === "manual") {
    const detail = decision.mailto
      ? "This sender unsubscribes by email. Send the prepared message from your mail app."
      : "This sender needs you to finish on their website. Open the link, then mark it done in History.";
    const actionId = await recordUnsubscribeAction(context, record, { status: "manual_required", detail });
    if (actionId) await recordUnsubscribeUsage(context, actionId);
    return { status: "manual_required", actionId, detail, manualUrl: decision.url, mailto: decision.mailto };
  }

  const actionId = await startUnsubscribeAction(context, record);
  if (!actionId) return { status: "pending", actionId: null, detail: "An unsubscribe request for this sender is already in progress." };

  const result = await sendOneClickUnsubscribe(decision.url);
  const outcome = result.kind === "accepted"
    ? { status: "success" as const, detail: "The sender accepted the one-click unsubscribe request. It can take a few days for their emails to stop.", httpStatus: result.status }
    : result.kind === "redirected"
      ? { status: "manual_required" as const, detail: "The sender redirected instead of confirming. Finish on their page, then mark it done in History.", httpStatus: result.status }
      : result.kind === "rejected"
        ? { status: "failed" as const, detail: `The sender rejected the request (HTTP ${result.status}). You can try their unsubscribe page instead.`, httpStatus: result.status }
        : { status: "failed" as const, detail: result.detail };
  await finishUnsubscribeAction(context, actionId, outcome);
  // Only unsubscribes that went through (or were handed to you to finish) count toward the plan.
  if (outcome.status !== "failed") await recordUnsubscribeUsage(context, actionId);
  return {
    status: outcome.status,
    actionId,
    detail: outcome.detail,
    // A blocked or unreachable host is not handed to the browser either.
    manualUrl: result.kind === "redirected" || result.kind === "rejected" ? decision.url : undefined,
  };
}
