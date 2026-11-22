// Loaded before the API tests (node --import). Sets the configuration the app expects and
// installs the module hooks that swap in the in-memory stand-ins.
import { register } from "node:module";

Object.assign(process.env, {
  NODE_ENV: "test",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://supabase.test",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:3000/api/gmail/callback",
  GOOGLE_TOKEN_ENCRYPTION_SECRET: "test-encryption-secret",
  STRIPE_SECRET_KEY: "sk_test_fake",
  STRIPE_WEBHOOK_SECRET: "whsec_test_fake",
  STRIPE_PREMIUM_PRICE_ID: "price_premium_test",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
});

register("./loader-hooks.mjs", import.meta.url);
