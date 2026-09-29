import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const callbackError = requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error");
  const nextPath = requestUrl.searchParams.get("next");
  const destination = nextPath?.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard";

  if (callbackError) {
    return NextResponse.redirect(
      new URL(`/auth/login?message=${encodeURIComponent(callbackError)}`, requestUrl.origin),
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(destination, requestUrl.origin));
    }
    // Never log the session itself: it contains access, refresh, and provider tokens.
    console.error("Error exchanging code for session:", error.message);
  }

  return NextResponse.redirect(
    new URL("/auth/login?message=Your sign-in link is invalid or expired.", requestUrl.origin),
  );
}