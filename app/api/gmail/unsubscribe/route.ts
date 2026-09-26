import { classifySenderGroups } from "@/lib/email/classifier";
import { getGmailInfo } from "@/lib/email/gmail";
import { getGmailToken } from "@/lib/email/google-oauth";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const token = await getGmailToken();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!token || token.userId !== user.id) return NextResponse.json({ error: "Gmail is not connected" }, { status: 400 });

  const body = await request.json().catch(() => null) as { senderEmail?: string; confirmed?: boolean } | null;
  if (!body?.confirmed || !body.senderEmail) return NextResponse.json({ error: "Explicit confirmation is required." }, { status: 400 });

  try {
    const groups = classifySenderGroups(await getGmailInfo(token));
    const group = groups.find((item) => item.senderEmail === body.senderEmail?.trim().toLowerCase());
    if (!group) return NextResponse.json({ error: "Sender was not found in the connected Gmail account." }, { status: 404 });
    if (!group.isSubscription || group.isProtected || !group.unsubscribeAvailable || !group.oneClickUnsubscribe || !group.unsubscribeUrl) {
      return NextResponse.json({ error: "This sender is protected or does not have a supported one-click unsubscribe option." }, { status: 400 });
    }
    return NextResponse.json({
      status: "ready_for_confirmation",
      message: "The sender is classified as a safe unsubscribe candidate. No unsubscribe request was sent.",
      unsubscribe: group.unsubscribe,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unsubscribe failed." }, { status: 502 });
  }
}