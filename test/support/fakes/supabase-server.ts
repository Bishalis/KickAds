import { createFakeClient } from "./db.ts";

/** The signed-in user's Supabase client, limited by row level security. */
export async function createClient() {
  return createFakeClient({ kind: "user" });
}
