// Scenarios section 11: the contact form.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { POST as contactRoute } from "../../app/api/contact/route.ts";
import { call, reset } from "../support/app.ts";
import { rows } from "../support/fakes/db.ts";
import { world } from "../support/world.ts";

beforeEach(reset);

const valid = { name: "Jane", email: "jane@example.com", message: "Hello, I have a question about my plan." };

function send(body: Record<string, unknown>, ip = "203.0.113.7") {
  // startedAt: the form was opened ten seconds ago, like a person filling it in.
  return call(contactRoute, { method: "POST", path: "/api/contact", body: { startedAt: Date.now() - 10_000, ...body }, headers: { "x-forwarded-for": ip } });
}

test("a valid message is stored", async () => {
  const result = await send(valid);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  const [stored] = rows("contact_messages");
  assert.equal(stored.email, "jane@example.com");
  assert.notEqual(stored.ip_hash, "203.0.113.7", "the IP is stored only as a hash");
});

test("missing fields are each reported", async () => {
  const result = await send({});
  assert.equal(result.status, 400);
  assert.deepEqual(result.body.fieldErrors, { name: "Enter your name.", email: "Enter your email address.", message: "Enter a message." });
});

test("an invalid email and a too-short message are reported", async () => {
  assert.equal((await send({ ...valid, email: "jane@" })).body.fieldErrors.email, "Enter a valid email address.");
  assert.equal((await send({ ...valid, message: "hi" })).body.fieldErrors.message, "Tell us a little more (at least 10 characters).");
  assert.equal(rows("contact_messages").length, 0);
});

test("bots are given a normal-looking success but nothing is stored", async () => {
  const honeypot = await send({ ...valid, website: "http://spam.example" });
  const tooFast = await send({ ...valid, startedAt: Date.now() });
  assert.deepEqual([honeypot.body, tooFast.body], [{ ok: true }, { ok: true }]);
  assert.equal(rows("contact_messages").length, 0);
});

test("more than 5 messages an hour from one sender are refused", async () => {
  const statuses = [];
  for (let index = 0; index < 6; index += 1) statuses.push((await send(valid)).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
  assert.equal(rows("contact_messages").length, 5);
  assert.equal((await send(valid, "198.51.100.9")).status, 200, "other senders aren't affected");
});

test("a database failure gives a friendly error", async () => {
  world.contact.failNext = true;
  const result = await send(valid);
  assert.equal(result.status, 500);
  assert.equal(result.body.error, "We couldn't send your message right now. Please try again in a few minutes.");
});
