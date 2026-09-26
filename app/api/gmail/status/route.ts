import { getGmailToken } from "@/lib/email/google-oauth";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const token = await getGmailToken();
  const connected = token?.userId === user.id;
  return NextResponse.json({
    gmailConnected: connected,
    email: connected ? token?.email ?? null : null,
  });
}