import { createGoogleOAuthClient, encryptGmailToken, gmailStateCookie, gmailTokenCookie } from "@/lib/email/google-oauth";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { google } from "googleapis";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const redirectTo = new URL("/connect-email", requestUrl.origin);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const cookieStore = await cookies();
  const savedState = cookieStore.get(gmailStateCookie)?.value;
  const state = requestUrl.searchParams.get("state");
  cookieStore.delete(gmailStateCookie);

  if (!user) return NextResponse.redirect(new URL("/auth/login", requestUrl.origin));
  if (!state || !savedState || state !== savedState) {
    redirectTo.searchParams.set("error", "The Gmail connection request expired. Please try again.");
    return NextResponse.redirect(redirectTo);
  }

  const error = requestUrl.searchParams.get("error");
  if (error) {
    redirectTo.searchParams.set("error", error === "access_denied" ? "Gmail access was not granted." : error);
    return NextResponse.redirect(redirectTo);
  }

  const code = requestUrl.searchParams.get("code");
  if (!code) {
    redirectTo.searchParams.set("error", "Google did not return an authorization code.");
    return NextResponse.redirect(redirectTo);
  }

  try {
    const client = createGoogleOAuthClient(requestUrl.origin);
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token) throw new Error("Google did not return a Gmail access token.");
    const gmail = google.gmail({ version: "v1", auth: client });
    client.setCredentials(tokens);
    const profile = await gmail.users.getProfile({ userId: "me" });

    cookieStore.set(gmailTokenCookie, encryptGmailToken({
      userId: user.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? undefined,
      email: profile.data.emailAddress ?? undefined,
    }), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    redirectTo.searchParams.set("connected", "true");
  } catch (error) {
    redirectTo.searchParams.set("error", error instanceof Error ? error.message : "Unable to connect Gmail.");
  }

  return NextResponse.redirect(redirectTo);
}