import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { FakeMessage } from "../support/world.ts";
import { fakeServicesUrl, testSupabase } from "./env";

// ---- The fake Google/Gmail/Stripe server ----

export async function resetFakeServices(request: APIRequestContext) {
  await request.post(`${fakeServicesUrl}/__test/reset`);
}

/** Creates a Gmail account on the fake server and makes the next Google consent screen approve it. */
export async function fakeGmailAccount(request: APIRequestContext, messages: FakeMessage[]) {
  const email = `e2e-${randomUUID().slice(0, 8)}@gmail.test`;
  await request.post(`${fakeServicesUrl}/__test/accounts`, { data: { email, messages } });
  await request.post(`${fakeServicesUrl}/__test/next-consent`, { data: { email } });
  return email;
}

export async function oneClickCalls(request: APIRequestContext): Promise<string[]> {
  return (await (await request.get(`${fakeServicesUrl}/__test/state`)).json()).oneClickCalls;
}

// ---- The test Supabase project ----

function admin() {
  if (!testSupabase) throw new Error("No test Supabase project configured (.env.e2e).");
  return createClient(testSupabase.url, testSupabase.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type TestUser = { id: string; email: string; password: string };

/** A confirmed user, created directly so no confirmation email is needed. */
export async function createTestUser(): Promise<TestUser> {
  const email = `e2e-${randomUUID().slice(0, 8)}@kickads.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`Could not create test user: ${error?.message}`);
  return { id: data.user.id, email, password };
}

/** Deleting the user removes everything they own (every table cascades from auth.users). */
export async function deleteTestUser(user: TestUser) {
  await admin().auth.admin.deleteUser(user.id);
}

/** Records that the user already used this many unsubscribes this month. */
export async function useUnsubscribes(user: TestUser, count: number) {
  const rows = Array.from({ length: count }, () => ({ user_id: user.id }));
  const { error } = await admin().from("unsubscribe_usage").insert(rows);
  if (error) throw new Error(error.message);
}

// ---- Common UI steps ----

export async function logIn(page: Page, user: TestUser) {
  await page.goto("/auth/login");
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Clicks Connect Gmail; the fake consent screen approves and returns to the app. */
export async function connectGmail(page: Page) {
  await page.goto("/connect-email");
  await page.getByRole("link", { name: "Connect Gmail" }).click();
  await expect(page.getByText("Gmail connected. Your inbox is ready to review.")).toBeVisible();
}

/** The row for one sender on the Subscriptions or Protected page. */
export function senderRow(page: Page, address: string) {
  return page.locator(`[data-sender="${address}"]`);
}
