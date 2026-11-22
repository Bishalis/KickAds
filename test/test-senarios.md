# KickAds manual test scenarios

Step-by-step checks for every feature, written so anyone can follow them in a browser. Each scenario lists what to do and what you should see. Tick the box when it passes; if it fails, note what you saw instead.

Most of these scenarios are now also checked automatically (see below). Do the full manual pass only before a first launch; after that, the **manual-only** list is enough after each deploy.

---

## What's automated and what still needs a person

**Automated tests** (run them with `npm run check`; see [the testing plan](#when-to-run-what)):

| Section | Automated in | Notes |
|---|---|---|
| 1. Account | `test/api/01-account.test.ts`, `test/e2e/public.spec.ts`, `lib/auth/signup.test.ts` | Real confirmation and reset emails are manual-only. |
| 2–3. Gmail access and connecting | `test/api/02-gmail-connection.test.ts`, `test/e2e/app.spec.ts` | Google's real consent screen is manual-only. |
| 4. Scanning and loading | `test/api/03-scanning.test.ts` | |
| 5. Sorting | `test/api/04-sorting.test.ts`, `lib/email/classifier.test.ts` | A sense-check of a real inbox is manual-only. |
| 6. Unsubscribing | `test/api/05-unsubscribe.test.ts`, `test/e2e/app.spec.ts` | |
| 7. Protect and ignore | `test/api/06-rules.test.ts`, `test/e2e/app.spec.ts` | |
| 8. Plans and limits | `test/api/07-plans.test.ts`, `test/e2e/app.spec.ts` | |
| 9. Billing | `test/api/08-billing.test.ts`, `lib/billing/webhook.test.ts`, `test/e2e/app.spec.ts` | Stripe's real checkout, cards, and portal are manual-only. |
| 10. Multiple accounts | `test/api/09-accounts.test.ts` | |
| 11. Contact | `test/api/10-contact.test.ts`, `test/e2e/public.spec.ts`, `test/e2e/app.spec.ts` | |
| 12. Privacy and safety | `test/api/11-security.test.ts`, `test/db/check-migrations.sh` | "Gmail is never changed" in a real inbox is manual-only. |
| 13. Information pages | none | Manual-only: read them against how the app behaved. |

**Manual-only** (needs real Google, Gmail, Stripe, or email; about 30 minutes):

- [ ] Section 1: the real confirmation email and the real password-reset email arrive and their links work.
- [ ] Section 2: Google sign-in on the login page asks only for name and email, not Gmail.
- [ ] Section 3: Google's real consent screen asks for read-only Gmail access; unticking it is refused; after Disconnect, KickAds is gone from your Google account's third-party access.
- [ ] Section 5: scan your own real inbox and sense-check where your bank, friends, and newsletters landed.
- [ ] Section 9: in Stripe test mode, pay with `4242 4242 4242 4242`, update the card to `4000 0000 0000 0341` and advance the subscription, and cancel in the real billing portal.
- [ ] Section 12: after everything, nothing in the real Gmail inbox was deleted, moved, labelled, or sent.
- [ ] Section 13: the Privacy and Help pages match how the app behaved.

### When to run what

| When | Run | Why |
|---|---|---|
| While coding | `npm test` | Unit tests, about a second |
| Before every commit | `npm run check` | Lint, types, unit tests, and API tests (about 10 seconds) |
| Before running a new migration on Supabase | `npm run test:db` | Checks the real SQL on a throwaway Postgres |
| Before merging or deploying | `npm run build` and `npm run test:e2e` | Production build, then the browser tests |
| After each deploy, and after changing Google, Stripe, or Supabase settings | The manual-only list above | Things only the real services can show |

GitHub runs the checks, build, and database check on every push, and the browser tests on pull requests to `main` (`.github/workflows/test.yml`).

---

## Before you start

**You need:**

- The app running locally with `npm run dev`, open at http://localhost:3000.
- All three migrations in `supabase/migrations/` run in the Supabase SQL Editor, in date order.
- `.env.local` filled in with every variable listed in `.env.example`.
- Two Google accounts you can sign in to (call them **Gmail A** and **Gmail B**). Gmail A should have plenty of newsletters and promotional email from the last 6 months, plus some personal mail and at least one bank, shop-order, or security email.
- A spare email address for signing up to KickAds itself.
- Stripe in **test mode**, the Stripe CLI installed, and `stripe listen --forward-to localhost:3000/api/billing/webhook` running in a terminal during the payment scenarios.

**Useful SQL (Supabase SQL Editor):**

- Make yourself Premium without paying:
  `insert into public.user_plans (user_id, plan) values ('<your-user-id>', 'premium') on conflict (user_id) do update set plan = excluded.plan;`
- Back to Freemium: the same statement with `'free'`.
- Reset this month's unsubscribe count:
  `delete from public.unsubscribe_usage where user_id = '<your-user-id>';`
- Find your user id: Supabase → Authentication → Users.

**Stripe test cards** (any future expiry date, any CVC):

- `4242 4242 4242 4242`: payment succeeds.
- `4000 0000 0000 0341`: card saves, but later charges fail (use this to test failed payments).

---

## 1. Account: sign up, log in, password reset

- [ ] **Sign up with all fields.** Go to Sign Up, enter a username, a new email, and the same password twice. Submit.
  **Expect:** "Check your email to confirm your account, then sign in." (If email confirmation is off in Supabase, you're sent to the login page instead.)
- [ ] **Confirm the email.** Click the link in the confirmation email.
  **Expect:** You land on the dashboard, signed in.
- [ ] **Sign up with a missing field.** Leave any one field empty and submit.
  **Expect:** "Complete all fields to create your account." No account is created.
- [ ] **Sign up with mismatched passwords.** Type two different passwords.
  **Expect:** "Passwords do not match."
- [ ] **Sign up with an email that already has an account.**
  **Expect:** Supabase's error is shown, and your username and email are still filled in (the password is not).
- [ ] **Log in with the right password.**
  **Expect:** You land on the dashboard.
- [ ] **Log in with a wrong password.**
  **Expect:** An error message; you stay on the login page.
- [ ] **Log in with empty fields.**
  **Expect:** "Enter your email and password."
- [ ] **Reset password.** On the login page click "Reset password?", enter your email, submit.
  **Expect:** "If an account exists for that email, a reset link is on its way." The same message appears for an email that has no account.
- [ ] **Set a new password.** Open the reset link from the email, enter a new password twice, save.
  **Expect:** You land on the dashboard. Logging out and back in works with the new password.
- [ ] **Log out.** Click "Log out" at the bottom of the sidebar.
  **Expect:** You're sent to the home page. Visiting http://localhost:3000/dashboard now sends you to the login page.

## 2. Signing in does not give Gmail access

- [ ] **Sign in with Google (not Connect Gmail).** Log out, then use the Google button on the login page.
  **Expect:** Google asks only for your name and email, not Gmail access. After signing in, the Subscriptions page says "Connect your Gmail" and shows no email data.

## 3. Connecting and disconnecting Gmail

- [ ] **Connect Gmail.** Go to Connect email → Connect Gmail. Choose Gmail A and approve.
  **Expect:** Google's screen asks for read-only Gmail access. You return to Connect email with "Gmail connected", and Gmail A is listed.
- [ ] **Deny access.** Start Connect Gmail again with a new account, then click Cancel on Google's screen.
  **Expect:** "Gmail access was not granted." Nothing new is listed.
- [ ] **Untick Gmail access.** If Google shows a checkbox for Gmail access, untick it and continue.
  **Expect:** "Gmail access wasn't included in what you approved…". Nothing new is listed.
- [ ] **Reconnect the same account.** Connect Gmail A again.
  **Expect:** It's still listed once, not twice.
- [ ] **Disconnect.** Click Disconnect next to Gmail A.
  **Expect:** It disappears from the list. In your Google account → Security → Third-party connections, KickAds no longer has access. Reconnect Gmail A before continuing.

## 4. First scan and page loading

- [ ] **First scan runs by itself.** With Gmail A newly connected, open Subscriptions.
  **Expect:** "Scanning your inbox..." and then a growing count ("Scanning... 1,000 emails so far"). When done, senders appear in the tabs.
- [ ] **Only received mail from the last 6 months.** Look through the senders.
  **Expect:** Your own address doesn't appear as a sender (Sent mail is excluded), and no sender's "last received" date is older than 6 months.
- [ ] **No rescan when coming back.** Go to History, then back to Subscriptions.
  **Expect:** The list appears straight away with no "Scanning" message.
- [ ] **No rescan after a page refresh.** Refresh the browser on Subscriptions.
  **Expect:** The list loads from saved results without scanning.
- [ ] **Rescan on request.** Click Rescan.
  **Expect:** A scan runs and the list updates.
- [ ] **Rescan too quickly.** Click Rescan again within 15 seconds of a scan finishing.
  **Expect:** "A scan just finished. Please wait a few seconds before scanning again."
- [ ] **Leaving mid-scan.** Start a Rescan and immediately go to another page.
  **Expect:** No error. Coming back shows the previous saved results.

## 5. How senders are sorted

- [ ] **Grouped by sender, not company.** Find two different newsletters from the same platform (for example two Substack publications).
  **Expect:** They appear as separate rows, each with its own address.
- [ ] **Newsletters land in Subscriptions.** A well-known newsletter with an unsubscribe link.
  **Expect:** Listed under Subscriptions.
- [ ] **Important mail is never a subscription.** Find your bank, an order confirmation, a password or sign-in alert, or a personal contact.
  **Expect:** It's not in the Subscriptions tab. It's under Needs review or on the Protected page.
- [ ] **People you email are protected.** A friend you've emailed recently.
  **Expect:** On the Protected page, with the reason "You have sent email to this address".
- [ ] **Review shows the reasons.** Click Review (or the arrow) on any sender.
  **Expect:** A list of reasons for its classification, the confidence, and how unsubscribe would work for it. No email subjects or contents are shown.
- [ ] **Counts match.** Compare each tab's number with how many rows it lists.
  **Expect:** They match. The Overview page shows the same totals for Subscriptions, Protected, and Needs review.

## 6. Unsubscribing

- [ ] **Confirmation is required.** Click Unsubscribe on a subscription.
  **Expect:** A confirmation box appears. Nothing happens until you confirm. Cancel closes it.
- [ ] **One-click unsubscribe succeeds.** Pick a sender whose details say "One-click: we send the request for you", and confirm.
  **Expect:** The button changes to "Unsubscribing..." and then "Unsubscribed ✓" without a page reload. A green message explains it can take a few days for emails to stop.
- [ ] **It stays unsubscribed.** Refresh the page.
  **Expect:** The sender still shows "Unsubscribed ✓" with the date. There's no Unsubscribe button for it.
- [ ] **It's in History.** Open History.
  **Expect:** A row with the sender, "One-click", the time, and "Successful".
- [ ] **Double-click protection.** On another one-click sender, confirm and then immediately try clicking again.
  **Expect:** Only one request is made. History shows a single entry.
- [ ] **Manual unsubscribe (web page).** Pick a sender whose details say "you finish it on the sender's side", and confirm.
  **Expect:** A yellow "Needs your action" message with "Open the sender's unsubscribe page". The sender stays active (Unsubscribe button still there). History shows "Needs your action".
- [ ] **Finish a manual unsubscribe.** Open the link, unsubscribe on the sender's site, come back, click "I've finished unsubscribing. Mark as unsubscribed".
  **Expect:** The sender shows "Unsubscribed ✓". History's entry becomes "Successful".
- [ ] **Mark done from History.** Do another manual unsubscribe, then in History click "I've unsubscribed. Mark as done".
  **Expect:** History shows "Successful"; on Subscriptions the sender shows "Unsubscribed ✓".
- [ ] **Email-based unsubscribe.** A sender that unsubscribes by email.
  **Expect:** "Open the unsubscribe email in your mail app" opens a pre-filled email. KickAds never sends email itself.
- [ ] **Needs review requires an extra confirmation.** Click Unsubscribe on a sender in Needs review.
  **Expect:** The confirm button stays disabled until you tick "I've reviewed this sender… and still want to unsubscribe".
- [ ] **No unsubscribe option.** A sender with no way to unsubscribe.
  **Expect:** It shows "No unsubscribe option" instead of a button.
- [ ] **A failed unsubscribe stays active.** (Hard to trigger on purpose; note it if it happens naturally.) If a sender rejects the request.
  **Expect:** A red "Failed" message, the sender keeps its Unsubscribe button, and History says "Failed", not "Successful".
- [ ] **Still sending.** If a sender keeps emailing more than two days after you unsubscribed and you Rescan.
  **Expect:** A yellow note: "This sender kept emailing after you unsubscribed…".

## 7. Protect, ignore, and the Protected page

- [ ] **Protect a sender.** On Subscriptions click "Protect sender" on any subscription.
  **Expect:** "…is protected and moved to the Protected page." It disappears from Subscriptions without a rescan and appears on the Protected page.
- [ ] **Protected senders have no unsubscribe.** Open the Protected page.
  **Expect:** No Unsubscribe button on any row. Only Unprotect and Review.
- [ ] **Unprotect.** Click Unprotect on that sender.
  **Expect:** "…is no longer protected and is back in your lists." It returns to the tab it was originally in.
- [ ] **Protect a whole domain.** Click "Protect example.com" (whatever the domain is) on a sender.
  **Expect:** Every sender from that domain, and its subdomains, moves to the Protected page.
- [ ] **Protected senders never appear in Subscriptions.** After protecting, check the Subscriptions, Needs review, and Ignored tabs.
  **Expect:** The protected sender is in none of them.
- [ ] **Ignore.** Click Ignore on a subscription.
  **Expect:** It moves to the Ignored tab and the Subscriptions count drops by one. Unignore moves it back.
- [ ] **Rules survive a rescan.** Protect one sender and ignore another, then Rescan.
  **Expect:** Both keep their protected/ignored state.

## 8. Plans and limits (Freemium)

Make sure you're on Freemium (see the SQL at the top) and reset your usage first.

- [ ] **Plan card.** Look at the bottom of the sidebar.
  **Expect:** "Freemium plan", "0 of 10 unsubscribes used this month", and "Upgrade plan".
- [ ] **Usage updates live.** Unsubscribe from one sender.
  **Expect:** The card changes to "1 of 10" without a refresh.
- [ ] **What counts.** A successful unsubscribe and a manual one (where you're given the sender's page) each add one. A failed attempt adds nothing.
- [ ] **Limit reached.** Use up all 10 (or set usage with SQL by inserting 10 rows into `unsubscribe_usage`), then try another unsubscribe.
  **Expect:** "You've used all 10 unsubscribes included in Freemium this month. Upgrade to Premium for unlimited unsubscribes." with a "See plans" link. The sender stays active.
- [ ] **Scan limit.** With an inbox of more than 1,500 emails in 6 months, Rescan.
  **Expect:** The scan stops at about 1,500 emails and a banner says Freemium scans your newest 1,500 emails, with an Upgrade link.
- [ ] **One account only.** On Connect email with Gmail A connected.
  **Expect:** No "Add another Gmail account" button. Instead: "Freemium includes 1 Gmail account. Upgrade to Premium to connect up to 3."

## 9. Upgrading and billing (Stripe test mode)

Keep `stripe listen` running for this section.

- [ ] **Plans page.** Click "Upgrade plan".
  **Expect:** Freemium and Premium side by side, your current plan marked, Premium at $3.99 / month.
- [ ] **Successful payment.** Click "Upgrade to Premium · $3.99 / month", pay with `4242 4242 4242 4242`.
  **Expect:** You return to Plans and see "Payment received. Activating Premium...", then "Premium is active. Thank you!". The sidebar card changes to "Premium plan". The `stripe listen` terminal shows the webhook events with status 200.
- [ ] **The success page alone doesn't grant Premium.** As a Freemium user, open http://localhost:3000/dashboard/upgrade?checkout=success directly, without paying.
  **Expect:** It waits on "Activating Premium..." and then says payment is still being confirmed. You stay on Freemium.
- [ ] **Cancelled checkout.** Start checkout, then click the back arrow on Stripe's page.
  **Expect:** "Checkout was cancelled. You haven't been charged." Still Freemium.
- [ ] **Premium limits.** As Premium: unsubscribe more than 10 times; Rescan a big inbox; connect a second and third Gmail account.
  **Expect:** No unsubscribe limit; the scan covers every email from the last 6 months with no 1,500 banner; up to 3 accounts can be connected, and the 4th is refused.
- [ ] **Duplicate webhook.** Copy an event id from `stripe listen` and run `stripe events resend <event-id>`.
  **Expect:** The terminal shows 200 and nothing changes in the app (no errors, plan unchanged).
- [ ] **Manage billing.** On Plans click "Manage billing".
  **Expect:** Stripe's billing page opens, showing your subscription and invoices.
- [ ] **Failed payment.** In Manage billing, change the card to `4000 0000 0000 0341`. Then, in the Stripe dashboard, open the subscription and advance it to the next payment (or use a test clock).
  **Expect:** Plans shows "Your last payment failed…". You keep Premium while Stripe retries.
- [ ] **Cancel the subscription.** In Manage billing, cancel the plan.
  **Expect:** Plans shows "Premium is cancelled and ends on <date>". Once it actually ends (or if you cancel immediately in the Stripe dashboard), you're back on Freemium.

## 10. Multiple Gmail accounts (Premium)

- [ ] **Add a second account.** As Premium, go to Connect email → "Add another Gmail account" and connect Gmail B.
  **Expect:** Both accounts are listed.
- [ ] **Switch accounts.** On Subscriptions, use the account dropdown to choose Gmail B.
  **Expect:** Gmail B scans the first time, then shows only Gmail B's senders. Switching back shows Gmail A's saved list without rescanning.
- [ ] **History shows the account.** Unsubscribe from a Gmail B sender, then open History.
  **Expect:** The entry says "In <Gmail B address>".
- [ ] **Downgrade locks extra accounts.** Switch yourself back to Freemium with SQL and refresh.
  **Expect:** Gmail A (connected first) still works. Gmail B shows "Needs Premium" on Connect email and is disabled in the account dropdown. Gmail B can still be disconnected.

## 11. Contact

- [ ] **Public page.** While logged out, click "CONTACT US" in the site footer.
  **Expect:** A contact form with Name, Email, Message, and Send message.
- [ ] **In-app page.** While logged in, click "Contact us" in the sidebar.
  **Expect:** The same form inside the dashboard, with your email already filled in.
- [ ] **Valid message.** Fill in all fields (message at least 10 characters), wait a few seconds, send.
  **Expect:** "Sending..." and then "Thanks, your message was sent." The message appears in Supabase → Table Editor → `contact_messages`.
- [ ] **Missing fields.** Send with everything empty.
  **Expect:** A message under each field ("Enter your name.", "Enter your email address.", "Enter a message.").
- [ ] **Bad email.** Enter `jane@` as the email.
  **Expect:** "Enter a valid email address."
- [ ] **Too short.** Message "hi".
  **Expect:** "Tell us a little more (at least 10 characters)."
- [ ] **Too many messages.** Send 6 valid messages within an hour.
  **Expect:** The 6th says "You've sent several messages recently. Please wait an hour before sending another." Only 5 are stored.

## 12. Privacy and safety checks

- [ ] **Logged-out access is blocked.** Log out, then visit /dashboard, /dashboard/unsubscriber, /dashboard/protected, /dashboard/history, and /connect-email.
  **Expect:** Each one sends you to the login page.
- [ ] **Users can't see each other's data.** Create a second KickAds account (different email), connect a different Gmail, and scan. Then log back in as the first user.
  **Expect:** Each user sees only their own senders, history, and plan.
- [ ] **No email content in the browser.** On Subscriptions, open the browser's developer tools → Network, click the `subscriptions` request, and read its response.
  **Expect:** Sender names, addresses, counts, and classifications only. No email subjects, bodies, or unsubscribe URLs.
- [ ] **Gmail is never changed.** After all of the above, check Gmail A.
  **Expect:** No emails deleted, moved, labelled, or sent by KickAds.
- [ ] **Revoked access is handled.** Remove KickAds from your Google account's third-party access, then click Rescan.
  **Expect:** "Gmail access expired or was revoked. Please reconnect Gmail." Reconnecting fixes it.

## 13. Information pages

- [ ] **Privacy & data.** Open it from the sidebar.
  **Expect:** It opens inside the dashboard (no Login button) and its description matches what you've seen during testing.
- [ ] **Help center.** Open it from the sidebar.
  **Expect:** It opens inside the dashboard, and each instruction matches how the app actually behaved.

---

## Recording results

For any scenario that fails, note:

1. The scenario name.
2. What you did, step by step.
3. What you expected (from this document).
4. What actually happened, with a screenshot if you can.
5. Any red error lines from the terminal running `npm run dev`.
