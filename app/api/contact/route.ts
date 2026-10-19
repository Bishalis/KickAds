import { createHash } from "node:crypto";
import { minimumFillTimeMs, validateContact } from "@/lib/contact";
import { jsonError } from "@/lib/email/route-helpers";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** Salted hash so rate limiting works without storing anyone's IP address. */
function hashIp(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const salt = process.env.CONTACT_IP_SALT ?? process.env.GOOGLE_TOKEN_ENCRYPTION_SECRET ?? "";
  return createHash("sha256").update(`contact:${salt}:${ip}`).digest("hex");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { name?: unknown; email?: unknown; message?: unknown; website?: unknown; startedAt?: unknown } | null;
  if (!body) return jsonError("Send the form as JSON.", 400);

  // Bot traps: a hidden field people never fill in, and a minimum time to fill the form.
  // Bots get a normal-looking success so they don't learn to adapt; nothing is stored.
  const tooFast = typeof body.startedAt === "number" && Date.now() - body.startedAt < minimumFillTimeMs;
  if ((typeof body.website === "string" && body.website) || tooFast) return NextResponse.json({ ok: true });

  const { values, errors } = validateContact(body);
  if (Object.keys(errors).length) return jsonError("Please fix the highlighted fields.", 400, { fieldErrors: errors });

  try {
    // Works signed in or out; the database function rate-limits to 5 messages per hour per IP.
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("submit_contact_message", {
      p_name: values.name,
      p_email: values.email,
      p_message: values.message,
      p_ip_hash: hashIp(request),
    });
    if (error) throw new Error(error.message);
    if (data === "rate_limited") return jsonError("You've sent several messages recently. Please wait an hour before sending another.", 429);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[contact] failed:", error instanceof Error ? error.message : "unknown error");
    return jsonError("We couldn't send your message right now. Please try again in a few minutes.", 500);
  }
}
