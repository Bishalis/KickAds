import { jsonError } from "@/lib/email/route-helpers";
import { getAuthedContext, getGmailConnection } from "@/lib/email/store";
import { NextResponse } from "next/server";

export async function GET() {
  const context = await getAuthedContext();
  if (!context) return jsonError("Please sign in.", 401);

  try {
    const connection = await getGmailConnection(context);
    return NextResponse.json({
      gmailConnected: Boolean(connection),
      email: connection?.googleEmail ?? null,
      lastScanAt: connection?.lastScanAt ?? null,
      lastScanStats: connection?.lastScanStats ?? null,
    });
  } catch (error) {
    console.error("[gmail status] failed:", error instanceof Error ? error.message : "unknown error");
    return jsonError("Could not check the Gmail connection.", 500);
  }
}
