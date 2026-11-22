// Scenarios section 1: sign up, log in, password reset, log out.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { login, logout, requestPasswordReset, signup, updatePassword } from "../../app/actions/auth.ts";
import { createUser, form, reset, runAction, signIn } from "../support/app.ts";
import { world } from "../support/world.ts";

beforeEach(reset);

const newAccount = { username: "jane", email: "jane@kickads.test", password: "s3cret-pass", confirmPassword: "s3cret-pass" };

describe("sign up", () => {
  test("with all fields asks the user to confirm their email", async () => {
    const { state } = await runAction(() => signup({}, form(newAccount)));
    assert.deepEqual(state, { message: "Check your email to confirm your account, then sign in." });
    assert.equal(world.users.length, 1);
  });

  test("with email confirmation off, sends the user to the login page", async () => {
    world.auth.confirmEmail = false;
    const { redirect } = await runAction(() => signup({}, form(newAccount)));
    assert.equal(redirect, "/auth/login");
  });

  test("with a missing field is refused and creates no account", async () => {
    for (const field of Object.keys(newAccount)) {
      const { state } = await runAction(() => signup({}, form({ ...newAccount, [field]: "" })));
      assert.deepEqual(state, { error: "Complete all fields to create your account." }, field);
    }
    assert.equal(world.users.length, 0);
  });

  test("with mismatched passwords is refused", async () => {
    const { state } = await runAction(() => signup({}, form({ ...newAccount, confirmPassword: "other" })));
    assert.deepEqual(state, { error: "Passwords do not match." });
    assert.equal(world.users.length, 0);
  });

  test("with an email that already has an account shows the error and keeps the form filled, minus the password", async () => {
    createUser(newAccount.email);
    const { state } = await runAction(() => signup({}, form(newAccount)));
    assert.deepEqual(state, { error: "User already registered", username: "jane", email: "jane@kickads.test" });
  });
});

describe("log in", () => {
  test("with the right password goes to the dashboard", async () => {
    const user = createUser("sam@kickads.test", "right-password");
    const { redirect } = await runAction(() => login({}, form({ email: "sam@kickads.test", password: "right-password" })));
    assert.equal(redirect, "/dashboard");
    assert.equal(world.session, user.id);
  });

  test("with a wrong password shows an error and stays signed out", async () => {
    createUser("sam@kickads.test", "right-password");
    const { state } = await runAction(() => login({}, form({ email: "sam@kickads.test", password: "wrong" })));
    assert.ok(state?.error);
    assert.equal(world.session, null);
  });

  test("with empty fields asks for both", async () => {
    const { state } = await runAction(() => login({}, form({ email: "", password: "" })));
    assert.deepEqual(state, { error: "Enter your email and password." });
  });
});

describe("password reset", () => {
  test("gives the same answer whether or not the account exists", async () => {
    createUser("sam@kickads.test");
    const known = await runAction(() => requestPasswordReset({}, form({ email: "sam@kickads.test" })));
    const unknown = await runAction(() => requestPasswordReset({}, form({ email: "nobody@kickads.test" })));
    assert.deepEqual(known.state, { message: "If an account exists for that email, a reset link is on its way." });
    assert.deepEqual(unknown.state, known.state);
  });

  test("the reset link returns the user to the set-new-password page", async () => {
    await runAction(() => requestPasswordReset({}, form({ email: "sam@kickads.test" })));
    assert.equal(world.auth.resetRequests[0].redirectTo, "http://localhost:3000/auth/callback?next=/auth/update-password");
  });

  test("setting a new password signs the user in with it", async () => {
    const user = createUser("sam@kickads.test", "old-password");
    signIn(user);
    const { redirect } = await runAction(() => updatePassword({}, form({ password: "new-password", confirmPassword: "new-password" })));
    assert.equal(redirect, "/dashboard");
    assert.equal(world.users[0].password, "new-password");
  });

  test("mismatched new passwords are refused", async () => {
    signIn(createUser());
    const { state } = await runAction(() => updatePassword({}, form({ password: "a-password", confirmPassword: "b-password" })));
    assert.deepEqual(state, { error: "Passwords do not match." });
  });

  test("an expired reset link (no session) is refused", async () => {
    const { state } = await runAction(() => updatePassword({}, form({ password: "new-password", confirmPassword: "new-password" })));
    assert.deepEqual(state, { error: "Your reset link has expired. Request a new one." });
  });
});

test("log out ends the session and goes to the home page", async () => {
  signIn(createUser());
  const { redirect } = await runAction(() => logout());
  assert.equal(redirect, "/");
  assert.equal(world.session, null);
});
