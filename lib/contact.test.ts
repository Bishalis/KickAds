import assert from "node:assert/strict";
import test from "node:test";
import { validateContact } from "./contact.ts";

test("a complete contact message is valid and trimmed", () => {
  const { values, errors } = validateContact({ name: " Jane ", email: "jane@example.com ", message: "Hello, I have a question." });
  assert.deepEqual(errors, {});
  assert.deepEqual(values, { name: "Jane", email: "jane@example.com", message: "Hello, I have a question." });
});

test("missing fields are reported individually", () => {
  assert.deepEqual(Object.keys(validateContact({}).errors).sort(), ["email", "message", "name"]);
  assert.deepEqual(Object.keys(validateContact({ name: "  ", email: "a@b.co", message: "Long enough message" }).errors), ["name"]);
});

test("invalid email addresses and very short messages are rejected", () => {
  for (const email of ["jane", "jane@", "jane@example", "jane @example.com", "<jane@example.com>"]) {
    assert.ok(validateContact({ name: "Jane", email, message: "Hello there, friend" }).errors.email, email);
  }
  assert.ok(validateContact({ name: "Jane", email: "jane@example.com", message: "hi" }).errors.message);
});
