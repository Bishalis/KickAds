import type { SenderRule } from "@/lib/email/classifier";
import { jsonError } from "@/lib/email/route-helpers";
import { isValidDomain, isValidEmailAddress } from "@/lib/email/sender";
import { addSenderRule, deleteSenderRule, getAuthedContext, listSenderRules } from "@/lib/email/store";
import { NextResponse } from "next/server";

function failure(action: string, error: unknown) {
  console.error(`[rules ${action}] failed:`, error instanceof Error ? error.message : "unknown error");
  return jsonError(`Could not ${action} the sender rule.`, 500);
}

export async function GET() {
  const context = await getAuthedContext();
  if (!context) return jsonError("Please sign in.", 401);
  try {
    return NextResponse.json({ rules: await listSenderRules(context) });
  } catch (error) {
    return failure("load", error);
  }
}

export async function POST(request: Request) {
  const context = await getAuthedContext();
  if (!context) return jsonError("Please sign in.", 401);

  const body = await request.json().catch(() => null) as { kind?: unknown; matchType?: unknown; value?: unknown } | null;
  const kind = body?.kind === "protect" || body?.kind === "ignore" ? body.kind : null;
  const matchType = body?.matchType === "address" || body?.matchType === "domain" ? body.matchType : null;
  const value = typeof body?.value === "string" ? body.value.trim().toLowerCase() : "";
  if (!kind || !matchType) return jsonError("Choose whether to protect or ignore a sender or domain.", 400);
  if (matchType === "address" ? !isValidEmailAddress(value) : !isValidDomain(value)) {
    return jsonError(matchType === "address" ? "Enter a valid email address." : "Enter a valid domain.", 400);
  }

  try {
    const rule: Omit<SenderRule, "id"> = { kind, matchType, value };
    await addSenderRule(context, rule);
    return NextResponse.json({ rules: await listSenderRules(context) });
  } catch (error) {
    return failure("save", error);
  }
}

export async function DELETE(request: Request) {
  const context = await getAuthedContext();
  if (!context) return jsonError("Please sign in.", 401);

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("Unknown rule.", 400);
  try {
    await deleteSenderRule(context, id);
    return NextResponse.json({ rules: await listSenderRules(context) });
  } catch (error) {
    return failure("remove", error);
  }
}
