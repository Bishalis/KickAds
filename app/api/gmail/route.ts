import { buildSenderGroups, getScanStats, toSenderSummary } from "@/lib/email/classifier";
import { createGmailClient, getRecentCorrespondents, scanMailbox } from "@/lib/email/gmail";
import { handleRouteError, jsonError } from "@/lib/email/route-helpers";
import { getAuthedContext, getGmailConnection, getLatestActionsBySender, listSenderRules, saveScanStats } from "@/lib/email/store";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const minScanIntervalMs = 15_000;

export async function GET() {
  const context = await getAuthedContext();
  if (!context) return jsonError("Please sign in to view your inbox.", 401);

  try {
    const connection = await getGmailConnection(context);
    if (!connection) return jsonError("Gmail is not connected.", 400, { gmailConnected: false });
    if (connection.lastScanAt && Date.now() - Date.parse(connection.lastScanAt) < minScanIntervalMs) {
      return jsonError("A scan just finished. Please wait a few seconds before scanning again.", 429);
    }

    const gmail = createGmailClient(connection.refreshToken);
    const [{ messages, capped }, correspondents, rules, latestActions] = await Promise.all([
      scanMailbox(gmail),
      getRecentCorrespondents(gmail),
      listSenderRules(context),
      getLatestActionsBySender(context),
    ]);
    const groups = buildSenderGroups(messages, { rules, correspondents });
    const stats = getScanStats(groups, capped);
    await saveScanStats(context, stats);

    return NextResponse.json({
      stats,
      rules,
      senders: groups.map((group) => ({ ...toSenderSummary(group), lastAction: latestActions.get(group.key) ?? null })),
    });
  } catch (error) {
    return handleRouteError(error, context, "scan your inbox");
  }
}
