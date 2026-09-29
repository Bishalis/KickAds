import { jsonError } from "@/lib/email/route-helpers";
import { getAuthedContext, getPlanUsage } from "@/lib/email/store";
import { NextResponse } from "next/server";

export async function GET() {
  const context = await getAuthedContext();
  if (!context) return jsonError("Please sign in.", 401);
  try {
    return NextResponse.json(await getPlanUsage(context));
  } catch (error) {
    console.error("[plan] failed:", error instanceof Error ? error.message : "unknown error");
    return jsonError("Could not load your plan.", 500);
  }
}
