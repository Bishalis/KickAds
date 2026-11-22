// Scenarios section 7: protect, ignore, and the Protected page.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { POST as unsubscribeRoute } from "../../app/api/gmail/unsubscribe/route.ts";
import { DELETE as deleteRuleRoute, POST as addRuleRoute } from "../../app/api/rules/route.ts";
import { allowRescan, call, keysIn, list, newsletter, reset, scan, userWithMailbox } from "../support/app.ts";
import { rows } from "../support/fakes/db.ts";
import { world } from "../support/world.ts";

beforeEach(() => {
  reset();
  return userWithMailbox([
    newsletter("News <hello@news.example.com>"),
    newsletter("Offers <offers@deals.example.com>"),
    newsletter("Shop <shop@other.example>"),
  ]);
});

function addRule(kind: "protect" | "ignore", matchType: "address" | "domain", value: string) {
  return call(addRuleRoute, { method: "POST", path: "/api/rules", body: { kind, matchType, value } });
}

async function removeRule(kind: string, value: string) {
  const added = await addRule(kind as "protect", value.includes("@") ? "address" : "domain", value);
  const rule = added.body.rules.find((item: { kind: string; value: string }) => item.kind === kind && item.value === value);
  return call(deleteRuleRoute, { method: "DELETE", path: `/api/rules?id=${rule.id}` });
}

test("protecting a sender moves it to the Protected page without a rescan", async () => {
  const callsBefore = world.google.calls.length;
  const result = await addRule("protect", "address", "hello@news.example.com");
  assert.equal(result.status, 200);
  assert.ok(!keysIn(await list()).includes("hello@news.example.com"));
  const [sender] = (await list("protected")).body.subscriptions;
  assert.equal(sender.address, "hello@news.example.com");
  assert.equal(sender.protectedBy, "address");
  assert.equal(sender.execution, "none");
  assert.equal(world.google.calls.length, callsBefore, "no Gmail calls");
});

test("a protected sender can't be unsubscribed", async () => {
  const key = (await list()).body.subscriptions.find((s: { address: string }) => s.address === "hello@news.example.com").key;
  await addRule("protect", "address", "hello@news.example.com");
  const result = await call(unsubscribeRoute, { method: "POST", path: "/api/gmail/unsubscribe", body: { key, confirmed: true } });
  assert.equal(result.status, 409);
  assert.equal(world.oneClick.calls.length, 0);
});

test("protection holds even if the stored sender row is altered directly", async () => {
  const key = (await list()).body.subscriptions.find((s: { address: string }) => s.address === "hello@news.example.com").key;
  await addRule("protect", "address", "hello@news.example.com");
  // Someone edits their own row through the database API to clear the protection.
  const row = rows("email_subscriptions").find((item) => item.address === "hello@news.example.com")!;
  row.protected_by = null;
  row.classification = "subscription";
  const result = await call(unsubscribeRoute, { method: "POST", path: "/api/gmail/unsubscribe", body: { key, confirmed: true } });
  // The server rechecks the protect rules against fresh Gmail data, so nothing is sent.
  assert.equal(result.status, 409);
  assert.equal(world.oneClick.calls.length, 0);
});

test("unprotecting restores the sender's original place", async () => {
  await removeRule("protect", "hello@news.example.com");
  const sender = (await list()).body.subscriptions.find((s: { address: string }) => s.address === "hello@news.example.com");
  assert.equal(sender.classification, "subscription");
  assert.equal(sender.protectedBy, null);
});

test("protecting a domain covers its subdomains", async () => {
  await addRule("protect", "domain", "example.com");
  assert.deepEqual(keysIn(await list("protected")).sort(), ["hello@news.example.com", "offers@deals.example.com"]);
  assert.deepEqual(keysIn(await list()), ["shop@other.example"]);
});

test("ignoring hides a sender from Subscriptions, and unignoring brings it back", async () => {
  await addRule("ignore", "address", "shop@other.example");
  assert.deepEqual(keysIn(await list("ignored")), ["shop@other.example"]);
  assert.ok(!keysIn(await list()).includes("shop@other.example"));
  assert.equal((await list()).body.counts.subscription, 2);

  await removeRule("ignore", "shop@other.example");
  assert.ok(keysIn(await list()).includes("shop@other.example"));
});

test("rules survive a rescan", async () => {
  await addRule("protect", "address", "hello@news.example.com");
  await addRule("ignore", "address", "shop@other.example");
  allowRescan();
  await scan();
  assert.deepEqual(keysIn(await list("protected")), ["hello@news.example.com"]);
  assert.deepEqual(keysIn(await list("ignored")), ["shop@other.example"]);
});

test("invalid rules are refused", async () => {
  assert.equal((await addRule("protect", "address", "not-an-email")).status, 400);
  assert.equal((await addRule("protect", "domain", "nodot")).status, 400);
  assert.equal((await call(addRuleRoute, { method: "POST", path: "/api/rules", body: { kind: "delete", matchType: "address", value: "a@b.co" } })).status, 400);
});
