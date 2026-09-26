import { getGmailToken, gmailTokenCookie, revokeGmailToken } from "@/lib/email/google-oauth";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const token = await getGmailToken();
  const cookieStore = await cookies();
  if (token?.userId === user.id) {
    try {
      await revokeGmailToken(token);
    } catch {
      // Removing the local credential still prevents any further Gmail API calls.
    }
  }
  cookieStore.delete(gmailTokenCookie);
  return NextResponse.json({ gmailConnected: false, email: null });
}