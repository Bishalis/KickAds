import { revokeGoogleGrant } from "@/lib/email/google-oauth";
import { jsonError } from "@/lib/email/route-helpers";
import { deleteGmailConnection, getAuthedContext, getGmailConnection } from "@/lib/email/store";
import { NextResponse } from "next/server";

export async function POST() {
  const context = await getAuthedContext();
  if (!context) return jsonError("Please sign in.", 401);

  try {
    const connection = await getGmailConnection(context);
    if (connection) {
      try {
        await revokeGoogleGrant(connection.refreshToken);
      } catch {
        // Already revoked or expired at Google; deleting the stored token still ends our access.
      }
    }
    await deleteGmailConnection(context);
    return NextResponse.json({ gmailConnected: false, email: null });
  } catch (error) {
    console.error("[gmail disconnect] failed:", error instanceof Error ? error.message : "unknown error");
    return jsonError("Could not disconnect Gmail. Please try again.", 500);
  }
}
