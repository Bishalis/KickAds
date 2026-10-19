import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client that bypasses row level security. Only for server code with no user
 * session that must write protected rows, such as the Stripe webhook updating a user's plan.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
