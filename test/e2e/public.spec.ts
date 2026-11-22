// Browser checks that need no account: signed-out access, form validation, public pages.
import { expect, test } from "@playwright/test";

test.describe("signed out", () => {
  for (const path of ["/dashboard", "/dashboard/unsubscriber", "/dashboard/protected", "/dashboard/history", "/connect-email"]) {
    test(`${path} sends you to the login page`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/auth\/login$/);
    });
  }
});

test("logging in with empty fields asks for both", async ({ page }) => {
  await page.goto("/auth/login");
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page.getByText("Enter your email and password.")).toBeVisible();
});

test("signing up with mismatched passwords is refused", async ({ page }) => {
  await page.goto("/auth/signup");
  await page.locator("#username").fill("jane");
  await page.locator("#email").fill("jane@kickads.test");
  await page.locator("#password").fill("first-password");
  await page.locator("#confirmPassword").fill("second-password");
  await page.getByRole("button", { name: "Sign Up" }).click();
  await expect(page.getByText("Passwords do not match.")).toBeVisible();
});

test("password reset gives the same answer for any email", async ({ page }) => {
  await page.goto("/reset-password");
  await page.locator("#email").fill("anyone@kickads.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If an account exists for that email, a reset link is on its way.")).toBeVisible();
});

test("the footer's Contact us link opens the contact form", async ({ page }) => {
  await page.goto("/");
  // The footer's link (the header's "Contact Us" only scrolls down to the footer).
  await page.getByRole("link", { name: "CONTACT US", exact: true }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.getByRole("heading", { name: "Get in touch" })).toBeVisible();
});

test("the contact form checks the fields before sending", async ({ page }) => {
  await page.goto("/contact");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Enter your name.")).toBeVisible();
  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await expect(page.getByText("Enter a message.")).toBeVisible();

  await page.getByLabel("Email").fill("jane@");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
});
