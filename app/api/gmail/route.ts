import { getGmailInfo } from "@/lib/email/gmail";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accessToken = searchParams.get("access_token");
  const email = searchParams.get("email");

  if (!accessToken && !email) {
    return NextResponse.json(
      { error: "Missing Gmail access token or email query parameter." },
      { status: 400 },
    );
  }

  if (!accessToken) {
    return NextResponse.json(
      {
        error: "Gmail is not connected yet. Please connect your Google account first.",
        messages: [],
      },
      { status: 400 },
    );
  }

  try {
    const data = await getGmailInfo(accessToken);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown Gmail error",
        messages: [],
      },
      { status: 400 },
    );
  }
}
