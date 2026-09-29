import { timingSafeEqual } from "node:crypto";
import { createGmailClient, getGmailProfileEmail } from "@/lib/email/gmail";
import { createGoogleOAuthClient, gmailReadonlyScope, gmailStateCookie, revokeGoogleGrant } from "@/lib/email/google-oauth";
import { getAuthedContext, getPlan, listGmailAccounts, saveGmailConnection } from "@/lib/email/store";
import { planLimits } from "@/lib/plans";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function statesMatch(received: string | null, saved: string | undefined) {
  if (!received || !saved || received.length !== saved.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(saved));
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const redirectTo = new URL("/connect-email", requestUrl.origin);
  const fail = (code: string) => {
    redirectTo.searchParams.set("error", code);
    return NextResponse.redirect(redirectTo);
  };

  const context = await getAuthedContext();
  const cookieStore = await cookies();
  const savedState = cookieStore.get(gmailStateCookie)?.value;
  cookieStore.delete({ name: gmailStateCookie, path: "/api/gmail/callback" });

  if (!context) return NextResponse.redirect(new URL("/auth/login", requestUrl.origin));
  const state = requestUrl.searchParams.get("state");
  if (!statesMatch(state, savedState) || !state?.endsWith(`.${context.user.id}`)) return fail("expired");
  if (requestUrl.searchParams.get("error")) return fail(requestUrl.searchParams.get("error") === "access_denied" ? "denied" : "failed");

  const code = requestUrl.searchParams.get("code");
  if (!code) return fail("failed");

  let refreshToken: string | undefined;
  try {
    const { tokens } = await createGoogleOAuthClient(requestUrl.origin).getToken(code);
    refreshToken = tokens.refresh_token ?? undefined;
    // Google's granular consent lets people untick Gmail; don't store a grant without it.
    const scopes = tokens.scope?.split(" ") ?? [];
    if (!scopes.includes(gmailReadonlyScope)) {
      if (refreshToken) await revokeGoogleGrant(refreshToken).catch(() => undefined);
      return fail("scope");
    }
    if (!refreshToken) return fail("failed");

    const googleEmail = await getGmailProfileEmail(createGmailClient(refreshToken));
    if (!googleEmail) throw new Error("Gmail profile had no email address.");

    // Reconnecting an existing account is always allowed; adding one must fit the plan.
    const plan = await getPlan(context);
    const accounts = await listGmailAccounts(context, plan);
    if (!accounts.some((account) => account.googleEmail === googleEmail) && accounts.length >= planLimits[plan].maxAccounts) {
      await revokeGoogleGrant(refreshToken).catch(() => undefined);
      return fail("limit");
    }
    await saveGmailConnection(context, { googleEmail, refreshToken, scopes: scopes.join(" ") });
  } catch (error) {
    console.error("[gmail callback] failed:", error instanceof Error ? error.message : "unknown error");
    if (refreshToken) await revokeGoogleGrant(refreshToken).catch(() => undefined);
    return fail("failed");
  }

  redirectTo.searchParams.set("connected", "true");
  return NextResponse.redirect(redirectTo);
}
