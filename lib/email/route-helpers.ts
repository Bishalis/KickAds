import { NextResponse } from "next/server";
import { PlanLimitError } from "@/lib/plans";
import { GmailAccessError } from "./gmail.ts";
import { deleteGmailConnection, type AuthedContext } from "./store.ts";

export function jsonError(error: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

/**
 * Maps failures to safe client messages. Details go to the server log only, and never
 * include tokens or message content.
 */
export async function handleRouteError(error: unknown, context: AuthedContext, action: string, accountId?: string) {
  if (error instanceof PlanLimitError) {
    return jsonError(error.message, 403, { upgradeRequired: true });
  }
  if (error instanceof GmailAccessError) {
    if (accountId) await deleteGmailConnection(context, accountId).catch(() => undefined);
    return jsonError("Gmail access expired or was revoked. Please reconnect Gmail.", 401, { gmailConnected: false });
  }
  console.error(`[${action}] failed:`, error instanceof Error ? error.message : "unknown error");
  return jsonError(`Could not ${action}. Please try again.`, 502);
}
