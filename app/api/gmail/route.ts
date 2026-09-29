import { finalizeGroups, foldMessages, getScanStats, toSenderSummary } from "@/lib/email/classifier";
import { createGmailClient, findBodyUnsubscribeUrls, getRecentCorrespondents, maxBodyLookups, scanBatchSize, scanMailboxBatch } from "@/lib/email/gmail";
import { handleRouteError, jsonError } from "@/lib/email/route-helpers";
import { decodeScanState, encodeScanState, type ScanState } from "@/lib/email/scan-state";
import { getAuthedContext, getGmailConnection, getLatestActionsBySender, getPlan, listSenderRules, saveScanStats } from "@/lib/email/store";
import { planLimits } from "@/lib/plans";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const minScanIntervalMs = 15_000;

/**
 * Scans one batch of the mailbox. The first call (no cursor) starts a scan; while more
 * email remains it returns `{ done: false, cursor }`, and the browser calls again with that
 * cursor until `{ done: true, senders }` comes back.
 */
export async function POST(request: Request) {
  const context = await getAuthedContext();
  if (!context) return jsonError("Please sign in to view your inbox.", 401);

  const body = await request.json().catch(() => null) as { accountId?: unknown; cursor?: unknown } | null;
  const accountId = typeof body?.accountId === "string" ? body.accountId : null;
  const cursor = typeof body?.cursor === "string" ? body.cursor : null;

  let connectionId: string | undefined;
  try {
    const plan = await getPlan(context);
    const connection = await getGmailConnection(context, plan, accountId);
    if (!connection) return jsonError("Gmail is not connected.", 400, { gmailConnected: false });
    connectionId = connection.id;
    const gmail = createGmailClient(connection.refreshToken);

    let state: ScanState;
    if (cursor) {
      const decoded = decodeScanState(cursor, context.user.id, connection.id);
      if (!decoded) return jsonError("This scan expired. Please start a new scan.", 400);
      state = decoded;
    } else {
      if (connection.lastScanAt && Date.now() - Date.parse(connection.lastScanAt) < minScanIntervalMs) {
        return jsonError("A scan just finished. Please wait a few seconds before scanning again.", 429);
      }
      state = {
        v: 1,
        userId: context.user.id,
        accountId: connection.id,
        listed: 0,
        correspondents: [...await getRecentCorrespondents(gmail)],
        groups: {},
        startedAt: Date.now(),
      };
    }

    const cap = planLimits[plan].maxScanMessages ?? Number.POSITIVE_INFINITY;
    const batch = await scanMailboxBatch(gmail, Math.min(scanBatchSize, cap - state.listed), state.pageToken);
    foldMessages(state.groups, batch.messages);
    state.listed += batch.listed;
    state.pageToken = batch.nextPageToken;

    const capped = Boolean(batch.nextPageToken) && state.listed >= cap;
    if (batch.nextPageToken && !capped) {
      return NextResponse.json({ done: false, cursor: encodeScanState(state), scanned: state.listed });
    }

    // Last batch: look for body unsubscribe links for the biggest senders that have no header.
    const withoutMethod = Object.values(state.groups)
      .filter((group) => group.address && !group.headerTarget && !group.bodyTarget)
      .sort((a, b) => b.emailCount - a.emailCount)
      .slice(0, maxBodyLookups);
    const bodyUrls = await findBodyUnsubscribeUrls(gmail, withoutMethod.map((group) => group.newestMessageId));
    for (const group of withoutMethod) {
      const url = bodyUrls.get(group.newestMessageId);
      if (url) group.bodyTarget = { date: group.lastReceivedAt, url };
    }

    const [rules, latestActions] = await Promise.all([listSenderRules(context), getLatestActionsBySender(context, connection.googleEmail)]);
    const groups = finalizeGroups(state.groups, { rules, correspondents: new Set(state.correspondents) });
    const stats = getScanStats(groups, capped);
    await saveScanStats(context, connection.id, stats);

    return NextResponse.json({
      done: true,
      scanned: state.listed,
      stats,
      rules,
      senders: groups.map((group) => ({ ...toSenderSummary(group), lastAction: latestActions.get(group.key) ?? null })),
    });
  } catch (error) {
    return handleRouteError(error, context, "scan your inbox", connectionId);
  }
}
