import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/**
 * Settings for the browser tests. The app runs on its own port with every external service
 * pointed at the fake server, and with a separate Supabase project from `.env.e2e`.
 * Without `.env.e2e`, Supabase also points at the fake server (nobody can sign in), so only
 * the signed-out tests run.
 */

const read = (file: string) => {
  const full = path.resolve(process.cwd(), file);
  return existsSync(full) ? parseEnv(readFileSync(full, "utf8")) : {};
};

const e2e = read(".env.e2e");
const local = read(".env.local");

export const appPort = 3100;
export const appUrl = `http://localhost:${appPort}`;
export const fakeServicesPort = 4100;
export const fakeServicesUrl = `http://127.0.0.1:${fakeServicesPort}`;
export const webhookSecret = "whsec_e2e";

export const testSupabase = e2e.NEXT_PUBLIC_SUPABASE_URL && e2e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && e2e.SUPABASE_SERVICE_ROLE_KEY
  ? { url: e2e.NEXT_PUBLIC_SUPABASE_URL, publishableKey: e2e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, serviceRoleKey: e2e.SUPABASE_SERVICE_ROLE_KEY }
  : null;

// The browser tests create and delete users. Never let them near the real project.
if (testSupabase && local.NEXT_PUBLIC_SUPABASE_URL && testSupabase.url.replace(/\/$/, "") === local.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")) {
  throw new Error(".env.e2e points at the same Supabase project as .env.local. Browser tests need a separate test project.");
}

/** Environment for the app's dev server. These override anything in .env.local. */
export const appEnv: Record<string, string> = {
  KICKADS_E2E: "1",
  KICKADS_FAKE_SERVICES_URL: fakeServicesUrl,
  NEXT_PUBLIC_SITE_URL: appUrl,
  NEXT_PUBLIC_SUPABASE_URL: testSupabase?.url ?? `${fakeServicesUrl}/supabase`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: testSupabase?.publishableKey ?? "e2e-no-supabase",
  SUPABASE_SERVICE_ROLE_KEY: testSupabase?.serviceRoleKey ?? "e2e-no-supabase",
  GOOGLE_CLIENT_ID: "e2e-client-id",
  GOOGLE_CLIENT_SECRET: "e2e-client-secret",
  GOOGLE_REDIRECT_URI: `${appUrl}/api/gmail/callback`,
  GOOGLE_TOKEN_ENCRYPTION_SECRET: "e2e-token-encryption-secret",
  STRIPE_SECRET_KEY: "sk_test_e2e",
  STRIPE_WEBHOOK_SECRET: webhookSecret,
  STRIPE_PREMIUM_PRICE_ID: "price_e2e_premium",
  CONTACT_IP_SALT: "e2e",
};
