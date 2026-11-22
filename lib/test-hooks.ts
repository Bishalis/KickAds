/**
 * Switches used only by the automated browser tests (test/e2e). When KICKADS_E2E=1 in a
 * non-production build, Google sign-in, the Gmail API, Stripe, and one-click unsubscribe
 * requests go to the local fake server instead of the real services. Production builds
 * ignore these variables entirely.
 */
export const fakeServicesUrl: string | null =
  process.env.NODE_ENV !== "production" && process.env.KICKADS_E2E === "1"
    ? process.env.KICKADS_FAKE_SERVICES_URL ?? null
    : null;
