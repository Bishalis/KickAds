// Signed-in browser flows. Needs a separate Supabase test project in .env.e2e.
import { expect, test } from "@playwright/test";
import { mail, newsletter } from "../support/mail.ts";
import { testSupabase } from "./env";
import {
  connectGmail, createTestUser, deleteTestUser, fakeGmailAccount, logIn, oneClickCalls, resetFakeServices, senderRow, useUnsubscribes,
  type TestUser,
} from "./helpers";

test.skip(!testSupabase, "Needs a separate Supabase test project in .env.e2e; see test/e2e/README.md");

let user: TestUser | null = null;

test.beforeEach(async ({ request }) => {
  await resetFakeServices(request);
  user = await createTestUser();
});

test.afterEach(async () => {
  if (user) await deleteTestUser(user);
  user = null;
});

// Senders on ".test" domains: their one-click endpoints are answered by the fake server.
const inbox = () => [
  newsletter("News <hello@news.example.test>"),
  newsletter("News <hello@news.example.test>", { daysAgo: 8 }),
  newsletter("Deals <deals@shop.example.test>"),
  mail("Mum <mum@gmail.com>", "Dinner on Sunday?"),
];

async function signedInWithGmail(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext) {
  await fakeGmailAccount(request, inbox());
  await logIn(page, user!);
  await connectGmail(page);
  await page.goto("/dashboard/unsubscriber");
  await expect(senderRow(page, "hello@news.example.test")).toBeVisible();
}

test("connecting Gmail scans it and sorts the senders", async ({ page, request }) => {
  await signedInWithGmail(page, request);
  await expect(senderRow(page, "deals@shop.example.test")).toBeVisible();
  await expect(senderRow(page, "mum@gmail.com")).toHaveCount(0);

  await page.goto("/dashboard/protected");
  await expect(senderRow(page, "mum@gmail.com")).toBeVisible();
  await expect(senderRow(page, "mum@gmail.com").getByRole("button", { name: "Unsubscribe" })).toHaveCount(0);
});

test("unsubscribing shows Unsubscribed straight away and keeps it after a reload", async ({ page, request }) => {
  await signedInWithGmail(page, request);
  const row = senderRow(page, "hello@news.example.test");
  await row.getByRole("button", { name: "Unsubscribe", exact: true }).click();
  // The confirmation box adds a second "Unsubscribe" button; that one sends the request.
  await row.getByRole("button", { name: "Unsubscribe", exact: true }).last().click();
  await expect(row.getByText("Unsubscribed", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Unsubscribe", exact: true })).toHaveCount(0);
  expect(await oneClickCalls(request)).toHaveLength(1);

  await page.reload();
  await expect(senderRow(page, "hello@news.example.test").getByText("Unsubscribed", { exact: true })).toBeVisible();
  await page.goto("/dashboard/history");
  await expect(page.getByText("Successful")).toBeVisible();
});

test("protecting a sender moves it to the Protected page", async ({ page, request }) => {
  await signedInWithGmail(page, request);
  await senderRow(page, "deals@shop.example.test").getByRole("button", { name: "Protect sender" }).click();
  await expect(page.getByText("deals@shop.example.test is protected and moved to the Protected page.")).toBeVisible();
  await expect(senderRow(page, "deals@shop.example.test")).toHaveCount(0);

  await page.goto("/dashboard/protected");
  await expect(senderRow(page, "deals@shop.example.test").getByRole("button", { name: /Unprotect/ })).toBeVisible();
});

test("Freemium refuses the 11th unsubscribe of the month", async ({ page, request }) => {
  await useUnsubscribes(user!, 10);
  await signedInWithGmail(page, request);
  await expect(page.getByText("10 of 10 unsubscribes used this month.")).toBeVisible();
  const row = senderRow(page, "hello@news.example.test");
  await row.getByRole("button", { name: "Unsubscribe", exact: true }).click();
  await row.getByRole("button", { name: "Unsubscribe", exact: true }).last().click();
  await expect(row.getByText(/You've used all 10 unsubscribes included in Freemium this month/)).toBeVisible();
  await expect(row.getByRole("link", { name: "See plans" })).toBeVisible();
  expect(await oneClickCalls(request)).toHaveLength(0);
});

test("paying through checkout switches the account to Premium", async ({ page }) => {
  await logIn(page, user!);
  await page.goto("/dashboard/upgrade");
  await page.getByRole("button", { name: /Upgrade to Premium/ }).click();
  // The fake checkout sends Stripe's signed webhook, then returns to the Plans page.
  await expect(page).toHaveURL(/\/dashboard\/upgrade\?checkout=success/);
  await expect(page.getByText("Premium plan")).toBeVisible();
});

test("the contact form sends a message", async ({ page }) => {
  await logIn(page, user!);
  await page.goto("/dashboard/contact");
  await page.getByLabel("Name").fill("Jane");
  await page.getByLabel("Message").fill("Hello, this is a test message from the browser tests.");
  // People take a few seconds to fill the form; instant submissions are treated as bots.
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Thanks, your message was sent.")).toBeVisible();
});

test("logging out ends the session", async ({ page }) => {
  await logIn(page, user!);
  await page.getByRole("button", { name: "Log out" }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/login$/);
});
