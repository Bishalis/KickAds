import { jsonError } from "@/lib/email/route-helpers";
import { getAuthedContext, getPlan, listGmailAccounts } from "@/lib/email/store";
import { NextResponse } from "next/server";

export async function GET() {
  const context = await getAuthedContext();
  if (!context) return jsonError("Please sign in.", 401);

  try {
    const plan = await getPlan(context);
    const accounts = await listGmailAccounts(context, plan);
    return NextResponse.json({
      gmailConnected: accounts.some((account) => !account.locked),
      plan,
      accounts,
    });
  } catch (error) {
    console.error("[gmail status] failed:", error instanceof Error ? error.message : "unknown error");
    return jsonError("Could not check the Gmail connection.", 500);
  }
}
