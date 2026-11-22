// Scenarios section 6: unsubscribing, every outcome, and the sender's stored status.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { GET as historyRoute, PATCH as markDoneRoute } from "../../app/api/history/route.ts";
import { POST as unsubscribeRoute } from "../../app/api/gmail/unsubscribe/route.ts";
import { call, list, mail, newsletter, reset, userWithMailbox } from "../support/app.ts";
import { rows } from "../support/fakes/db.ts";
import { world } from "../support/world.ts";

beforeEach(reset);

function unsubscribe(key: string, extra: Record<string, unknown> = { confirmed: true }) {
  return call(unsubscribeRoute, { method: "POST", path: "/api/gmail/unsubscribe", body: { key, ...extra } });
}

async function senderIn(tab: "subscription" | "review" | "protected", address: string) {
  return (await list(tab)).body.subscriptions.find((sender: { address: string }) => sender.address === address);
}

async function history() {
  return (await call(historyRoute, { path: "/api/history" })).body.actions;
}

describe("one-click unsubscribe", () => {
  beforeEach(() => userWithMailbox([newsletter("News <hello@news.example.com>")]));

  test("needs explicit confirmation", async () => {
    const sender = await senderIn("subscription", "hello@news.example.com");
    const result = await unsubscribe(sender.key, {});
    assert.equal(result.status, 400);
    assert.equal(result.body.error, "Explicit confirmation is required.");
    assert.equal(world.oneClick.calls.length, 0);
  });

  test("succeeds, marks the sender unsubscribed, and records it in History", async () => {
    const sender = await senderIn("subscription", "hello@news.example.com");
    assert.equal(sender.execution, "automatic");
    const result = await unsubscribe(sender.key);
    assert.equal(result.status, 200);
    assert.equal(result.body.status, "success");
    assert.equal(result.body.subscription.status, "unsubscribed");
    assert.equal(world.oneClick.calls.length, 1);

    // It stays unsubscribed after a reload, and History has the entry.
    assert.equal((await senderIn("subscription", "hello@news.example.com")).status, "unsubscribed");
    const [entry] = await history();
    assert.equal(entry.status, "success");
    assert.equal(entry.method, "one_click");
    assert.equal(entry.senderAddress, "hello@news.example.com");
  });

  test("can't be done twice", async () => {
    const sender = await senderIn("subscription", "hello@news.example.com");
    await unsubscribe(sender.key);
    const again = await unsubscribe(sender.key);
    assert.equal(again.status, 409);
    assert.equal(again.body.error, "You've already unsubscribed from this sender.");
    assert.equal(world.oneClick.calls.length, 1);
  });

  test("two clicks at the same moment send only one request", async () => {
    const sender = await senderIn("subscription", "hello@news.example.com");
    world.oneClick.respond = () => new Promise((resolve) => setTimeout(() => resolve({ kind: "accepted", status: 200 }), 20));
    const results = await Promise.all([unsubscribe(sender.key), unsubscribe(sender.key)]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    assert.equal(world.oneClick.calls.length, 1);
    assert.equal((await history()).length, 1);
  });

  test("a rejected request leaves the sender active and History says it failed", async () => {
    world.oneClick.respond = async () => ({ kind: "rejected", status: 500 });
    const sender = await senderIn("subscription", "hello@news.example.com");
    const result = await unsubscribe(sender.key);
    assert.equal(result.body.status, "failed");
    assert.equal(result.body.subscription.status, "active");
    assert.ok(result.body.manualUrl, "the sender's page is offered as a fallback");
    assert.equal((await history())[0].status, "failed");
    assert.equal(rows("unsubscribe_usage").length, 0, "a failed attempt doesn't count toward the plan");
  });
});

describe("manual unsubscribe", () => {
  test("via the sender's web page stays active until the user marks it done", async () => {
    await userWithMailbox([newsletter("Shop <news@shop.example>", { method: "https" })]);
    const sender = await senderIn("subscription", "news@shop.example");
    assert.equal(sender.execution, "manual");

    const result = await unsubscribe(sender.key);
    assert.equal(result.body.status, "manual_required");
    assert.equal(result.body.manualUrl, "https://shop.example/unsubscribe/news%40shop.example");
    assert.equal(result.body.subscription.status, "active");
    assert.equal(world.oneClick.calls.length, 0, "nothing is sent for the user");

    const done = await call(markDoneRoute, { method: "PATCH", path: "/api/history", body: { id: result.body.actionId } });
    assert.equal(done.status, 200);
    assert.equal((await senderIn("subscription", "news@shop.example")).status, "unsubscribed");
    assert.equal((await history())[0].status, "success");
  });

  test("by email hands the user a prepared email instead of sending one", async () => {
    await userWithMailbox([newsletter("List <digest@list.example>", { method: "mailto" })]);
    const sender = await senderIn("subscription", "digest@list.example");
    const result = await unsubscribe(sender.key);
    assert.equal(result.body.status, "manual_required");
    assert.equal(result.body.mailto, "mailto:leave@list.example?subject=unsubscribe");
  });

  test("only entries that needed manual action can be marked done", async () => {
    await userWithMailbox([newsletter("News <hello@news.example.com>")]);
    const sender = await senderIn("subscription", "hello@news.example.com");
    const result = await unsubscribe(sender.key);
    const done = await call(markDoneRoute, { method: "PATCH", path: "/api/history", body: { id: result.body.actionId } });
    assert.equal(done.status, 409);
  });
});

test("a sender that needs review requires the user to confirm they reviewed it", async () => {
  await userWithMailbox([newsletter("Lookalike <news@shop.example>", { verified: false })]);
  const sender = await senderIn("review", "news@shop.example");

  const refused = await unsubscribe(sender.key);
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /needs review/);
  assert.equal((await senderIn("review", "news@shop.example")).status, "active");

  const acknowledged = await unsubscribe(sender.key, { confirmed: true, acknowledgeReview: true });
  // An unverified sender is never unsubscribed automatically; the user finishes it themselves.
  assert.equal(acknowledged.body.status, "manual_required");
  assert.equal(world.oneClick.calls.length, 0);
});

test("a sender with no unsubscribe option is reported as such and stays active", async () => {
  await userWithMailbox([newsletter("Promo <promo@shop.example>", { method: "none" })]);
  const sender = await senderIn("subscription", "promo@shop.example");
  assert.equal(sender.execution, "none");
  const result = await unsubscribe(sender.key);
  assert.equal(result.body.status, "no_method");
  assert.equal(result.body.subscription.status, "active");
  assert.equal((await history())[0].status, "no_method");
});

test("a protected sender can never be unsubscribed", async () => {
  await userWithMailbox([mail("Mum <mum@gmail.com>", "Dinner on Sunday?")]);
  const sender = await senderIn("protected", "mum@gmail.com");
  const result = await unsubscribe(sender.key);
  assert.equal(result.status, 409);
  assert.equal(result.body.error, "This sender is protected. Remove the protection first if you really want to unsubscribe.");
  assert.equal(world.oneClick.calls.length, 0);
  assert.equal((await history()).length, 0);
});

test("a sender that isn't in the latest scan can't be unsubscribed", async () => {
  await userWithMailbox([newsletter("News <hello@news.example.com>")]);
  const result = await unsubscribe("someone@else.example|");
  assert.equal(result.status, 404);
});

test("a sender that keeps emailing after unsubscribing is flagged", async () => {
  await userWithMailbox([newsletter("News <hello@news.example.com>")]);
  const sender = await senderIn("subscription", "hello@news.example.com");
  await unsubscribe(sender.key);
  const row = rows("email_subscriptions").find((item) => item.address === "hello@news.example.com")!;
  row.unsubscribed_at = new Date(Date.now() - 10 * 86_400_000).toISOString();
  row.last_received_at = new Date().toISOString();
  assert.equal((await senderIn("subscription", "hello@news.example.com")).stillSending, true);
});
