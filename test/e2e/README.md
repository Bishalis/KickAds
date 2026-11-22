# Browser tests

`npm run test:e2e` opens the app in a real (headless) Chrome and clicks through it.

It starts two servers itself:

- **A fake Google, Gmail, and Stripe** (`fake-services.ts`, port 4100). The app talks to it
  instead of the real services because it runs with `KICKADS_E2E=1` (see `lib/test-hooks.ts`;
  production builds ignore this). Google's consent screen approves instantly, Stripe's checkout
  pays instantly and sends a signed webhook, and senders' one-click endpoints answer 200.
- **The app** (`next dev` on port 3100, build folder `.next-e2e`), so it can run while
  `npm run dev` is running on port 3000.

## Without any setup

The signed-out tests run (`public.spec.ts`): private pages redirect to login, form
validation, the contact page. The signed-in tests are skipped with a message.

## One-time setup for the signed-in tests

1. Create a **separate** Supabase project for testing. Never use the real one: the tests
   create and delete users.
2. In that project's SQL Editor, run every file in `supabase/migrations/`, in date order.
3. Copy `.env.e2e.example` to `.env.e2e` and fill in the test project's URL, publishable key,
   and service role key.
4. Run `npm run test:e2e`.

The tests refuse to start if `.env.e2e` points at the same project as `.env.local`.

## When something fails

Playwright keeps a trace of each failed test. Open it with the command it prints, for example
`npx playwright show-trace test-results/<test-name>/trace.zip`, to step through every click.
