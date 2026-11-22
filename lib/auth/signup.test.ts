import assert from "node:assert/strict";
import test from "node:test";
import { signupUser, type SignUp } from "./signup.ts";

function form(fields: Record<string, string | Blob>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const valid = {
  username: "jane",
  email: "jane@example.com",
  password: "s3cret-pass",
  confirmPassword: "s3cret-pass",
};

/** A fake Supabase signUp that records its calls and returns a canned response. */
function fakeSignUp(response: Awaited<ReturnType<SignUp>>) {
  const calls: Array<Parameters<SignUp>[0]> = [];
  const signUp: SignUp = async (params) => {
    calls.push(params);
    return response;
  };
  return { signUp, calls };
}



const confirmationRequired = { data: { session: null }, error: null };

test("missing fields are rejected before calling Supabase", async () => {
  for (const field of Object.keys(valid)) {
    const { signUp, calls } = fakeSignUp(confirmationRequired);
    const result = await signupUser(
      signUp,
      form({ ...valid, [field]: "" }),
      "http://localhost:3000",
    );
    assert.deepEqual(
      result,
      { error: "Complete all fields to create your account." },
      field,
    );
    assert.equal(calls.length, 0, field);
  }
});

test("a file upload in place of a text field is rejected", async () => {
  const { signUp, calls } = fakeSignUp(confirmationRequired);
  const result = await signupUser(
    signUp,
    form({ ...valid, email: new Blob(["x"]) }),
    "http://localhost:3000",
  );
  assert.deepEqual(result, {
    error: "Complete all fields to create your account.",
  });
  assert.equal(calls.length, 0);
});

test("mismatched passwords are rejected before calling Supabase", async () => {
  const { signUp, calls } = fakeSignUp(confirmationRequired);
  const result = await signupUser(
    signUp,
    form({ ...valid, confirmPassword: "different" }),
    "http://localhost:3000",
  );
  assert.deepEqual(result, { error: "Passwords do not match." });
  assert.equal(calls.length, 0);
});

test("valid details are sent to Supabase with the confirmation link and username", async () => {
  const { signUp, calls } = fakeSignUp(confirmationRequired);
  await signupUser(signUp, form(valid), "https://kickads.example");
  assert.deepEqual(calls, [
    {
      email: "jane@example.com",
      password: "s3cret-pass",
      options: {
        emailRedirectTo: "https://kickads.example/auth/callback",
        data: { username: "jane", email: "jane@example.com" },
      },
    },
  ]);
});

test("when email confirmation is required, the user is told to check their inbox", async () => {
  const { signUp } = fakeSignUp(confirmationRequired);
  assert.deepEqual(
    await signupUser(signUp, form(valid), "http://localhost:3000"),
    {
      message: "Check your email to confirm your account, then sign in.",
    },
  );
});

test("a Supabase error is shown and the form is refilled, without the password", async () => {
  const { signUp } = fakeSignUp({
    data: { session: null },
    error: { message: "User already registered" },
  });
  const result = await signupUser(signUp, form(valid), "http://localhost:3000");
  assert.deepEqual(result, {
    error: "User already registered",
    username: "jane",
    email: "jane@example.com",
  });
  assert.doesNotMatch(JSON.stringify(result), /s3cret-pass/);
});

test("when Supabase signs the user in immediately, they are redirected", async () => {
  const { signUp } = fakeSignUp({
    data: { session: { access_token: "token" } },
    error: null,
  });
  assert.deepEqual(
    await signupUser(signUp, form(valid), "http://localhost:3000"),
    { redirectTo: "/auth/login" },
  );
});
