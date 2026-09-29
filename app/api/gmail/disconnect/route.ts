import { decryptSecret, revokeGoogleGrant } from "@/lib/email/google-oauth";
import { jsonError } from "@/lib/email/route-helpers";
import { deleteGmailConnection, getAuthedContext } from "@/lib/email/store";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const context = await getAuthedContext();
  if (!context) return jsonError("Please sign in.", 401);

  const body = await request.json().catch(() => null) as { accountId?: unknown } | null;
  const accountId = typeof body?.accountId === "string" && /^[0-9a-f-]{36}$/i.test(body.accountId) ? body.accountId : null;
  if (!accountId) return jsonError("Choose an account to disconnect.", 400);

  try {
    // Locked accounts (beyond the current plan) can still be disconnected, so read the row directly.
    const { data } = await context.supabase.from("gmail_connections").select("encrypted_refresh_token").eq("id", accountId).maybeSingle();
    const refreshToken = data ? decryptSecret(data.encrypted_refresh_token) : null;
    if (refreshToken) {
      try {
        await revokeGoogleGrant(refreshToken);
      } catch {
        // Already revoked or expired at Google; deleting the stored token still ends our access.
      }
    }
    await deleteGmailConnection(context, accountId);
    return NextResponse.json({ disconnected: accountId });
  } catch (error) {
    console.error("[gmail disconnect] failed:", error instanceof Error ? error.message : "unknown error");
    return jsonError("Could not disconnect Gmail. Please try again.", 500);
  }
}
