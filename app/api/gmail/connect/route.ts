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
    const state = randomBytes(32).toString("hex");
    const client = createGoogleOAuthClient(new URL(request.url).origin);
    const cookieStore = await cookies();
    cookieStore.set(gmailStateCookie, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
      path: "/",
    });
    return NextResponse.redirect(getGmailAuthorizationUrl(client, state));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail is not configured.";
    return NextResponse.redirect(new URL(`/connect-email?error=${encodeURIComponent(message)}`, request.url));
  }
}