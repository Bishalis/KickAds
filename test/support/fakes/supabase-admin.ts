import { createFakeClient } from "./db.ts";

/** The service-role client, which bypasses row level security. */
export function createAdminClient() {
  return createFakeClient({ kind: "service" });
}
