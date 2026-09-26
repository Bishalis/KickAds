import { getGmailApiError, getGmailInfo } from "@/lib/email/gmail";
import { classifySenderGroups } from "@/lib/email/classifier";
import { getGmailToken, gmailTokenCookie } from "@/lib/email/google-oauth";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const gmailToken = await getGmailToken();

  if (!user) {
    return NextResponse.json(
      { error: "Please sign in to view your inbox." },
      { status: 401 },
    );
  }

  if (!gmailToken || gmailToken.userId !== user.id) {
    return NextResponse.json(
      { error: "Gmail is not connected" },
      { status: 400 },
    );
  }

  try {
    const messages = await getGmailInfo(gmailToken);
    const groups = classifySenderGroups(messages);
    return NextResponse.json({
      messages: groups.flatMap((group) => group.emails),
      groups,
    });
  } catch (error) {
    const gmailError = getGmailApiError(error);
    const authorizationError = gmailError.status === 401 || gmailError.status === 403 || (gmailError.status === 400 && /authorization|invalid_grant|scope|credential/i.test(gmailError.message)) || /invalid_grant|insufficient.*scope|authentication scope|unauthorized/i.test(gmailError.message);
    if (authorizationError) {
      const cookieStore = await cookies();
      cookieStore.delete(gmailTokenCookie);
      return NextResponse.json(
        { error: "Gmail authorization expired or was revoked. Please reconnect Gmail.", gmailConnected: false },
        { status: 401 },
      );
    }
    return NextResponse.json(
      {
        error: `Gmail request failed${gmailError.status ? ` (${gmailError.status})` : ""}: ${gmailError.message}`,
      },
      { status: 502 },
    );
  }
}
