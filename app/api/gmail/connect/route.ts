import { createClient } from "@/lib/supabase/server";
import {
  createGoogleOAuthClient,
  getGmailAuthorizationUrl,
  gmailStateCookie,
} from "@/lib/email/google-oauth";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/login", request.url));

  try {
    // Bind the state to the user so a callback can't complete under a different session.
    const state = `${randomBytes(32).toString("hex")}.${user.id}`;
    const client = createGoogleOAuthClient(new URL(request.url).origin);
    const cookieStore = await cookies();
    cookieStore.set(gmailStateCookie, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
      path: "/api/gmail/callback",
    });
    return NextResponse.redirect(getGmailAuthorizationUrl(client, state));
  } catch (error) {
    console.error("[gmail connect] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.redirect(new URL("/connect-email?error=config", request.url));
  }
}
