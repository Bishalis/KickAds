import { jsonError } from "@/lib/email/route-helpers";
import { confirmManualAction, getAuthedContext, listUnsubscribeActions } from "@/lib/email/store";
import { NextResponse } from "next/server";

export async function GET() {
  const context = await getAuthedContext();
  if (!context) return jsonError("Please sign in.", 401);
  try {
    return NextResponse.json({ actions: await listUnsubscribeActions(context) });
  } catch (error) {
    console.error("[history load] failed:", error instanceof Error ? error.message : "unknown error");
    return jsonError("Could not load your unsubscribe history.", 500);
  }
}

/** Marks a manual unsubscribe as done once the user has finished it on the sender's side. */
export async function PATCH(request: Request) {
  const context = await getAuthedContext();
  if (!context) return jsonError("Please sign in.", 401);

  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  const id = typeof body?.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  if (!id) return jsonError("Unknown history entry.", 400);
  try {
    if (!await confirmManualAction(context, id)) return jsonError("Only entries that needed manual action can be marked done.", 409);
    return NextResponse.json({ actions: await listUnsubscribeActions(context) });
  } catch (error) {
    console.error("[history update] failed:", error instanceof Error ? error.message : "unknown error");
    return jsonError("Could not update your unsubscribe history.", 500);
  }
}
