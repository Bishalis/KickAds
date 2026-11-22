import { defineConfig, devices } from "@playwright/test";
import { appEnv, appPort, appUrl, fakeServicesPort, fakeServicesUrl, webhookSecret } from "./test/e2e/env";

/**
 * Browser tests: `npm run test:e2e`. Starts the fake Google/Gmail/Stripe server and a
 * separate Next dev server (port 3100, build folder .next-e2e), so it can run alongside
 * `npm run dev`. See test/e2e/README.md for the one-time setup.
 */
export default defineConfig({
  testDir: "test/e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  // The fake server holds shared state, so tests run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: appUrl, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node --experimental-strip-types test/e2e/fake-services.ts",
      url: `${fakeServicesUrl}/__test/health`,
      env: { FAKE_SERVICES_PORT: String(fakeServicesPort), APP_URL: appUrl, STRIPE_WEBHOOK_SECRET: webhookSecret },
      reuseExistingServer: false,
    },
    {
      command: `npx next dev --port ${appPort}`,
      url: appUrl,
      env: appEnv,
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
