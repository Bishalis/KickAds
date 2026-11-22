import type { OneClickResult } from "../../lib/email/safe-fetch.ts";

/**
 * Everything the in-memory stand-ins for Supabase, Google, and Stripe share. Tests set it
 * up, call the real route handlers, and then inspect it. Reset before every test.
 */

export type Row = Record<string, unknown>;

export type FakeUser = { id: string; email: string; password: string };

export type FakeMessage = {
  id: string;
  from: string;
  to?: string;
  subject: string;
  /** Milliseconds since epoch. */
  date: number;
  labels: string[];
  headers?: Array<[string, string]>;
  html?: string;
};

export type FakeGoogleAccount = {
  email: string;
  refreshToken: string;
  messages: FakeMessage[];
  revoked: boolean;
};

export type GmailCall = { method: "list" | "get" | "profile"; q?: string; id?: string; format?: string };

export type FakeStripeSubscription = {
  id: string;
  status: string;
  customer: string;
  cancel_at_period_end: boolean;
  metadata: Record<string, string>;
  items: { data: Array<{ current_period_end: number }> };
};

function initialState() {
  return {
    tables: {} as Record<string, Row[]>,
    users: [] as FakeUser[],
    /** The signed-in user's id, standing in for the Supabase session cookie. */
    session: null as string | null,
    auth: {
      confirmEmail: true,
      resetRequests: [] as Array<{ email: string; redirectTo?: string }>,
    },
    cookies: new Map<string, string>(),
    google: {
      accounts: [] as FakeGoogleAccount[],
      /** Authorization codes handed back by the fake consent screen. */
      codes: new Map<string, { account: FakeGoogleAccount; scope: string }>(),
      revoked: [] as string[],
      calls: [] as GmailCall[],
    },
    stripe: {
      customers: [] as Array<{ id: string; email?: string; metadata: Record<string, string> }>,
      checkoutSessions: [] as Array<Record<string, unknown>>,
      portalSessions: [] as Array<Record<string, unknown>>,
      subscriptions: new Map<string, FakeStripeSubscription>(),
    },
    oneClick: {
      calls: [] as string[],
      /** How the sender's server answers; tests swap this to simulate failures or slow replies. */
      respond: (async () => ({ kind: "accepted", status: 200 })) as (url: string) => Promise<OneClickResult>,
    },
    contact: { failNext: false },
  };
}

export const world = initialState();

export function resetWorld() {
  Object.assign(world, initialState());
}
