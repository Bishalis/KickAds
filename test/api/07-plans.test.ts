// Scenarios section 8: Freemium and Premium limits.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { POST as unsubscribeRoute } from "../../app/api/gmail/unsubscribe/route.ts";
import { GET as planRoute } from "../../app/api/plan/route.ts";
import {
  addGoogleAccount, call, connectGmail, createUser, list, newsletter, reset, scan, setPlan, signIn, userWithMailbox,
} from "../support/app.ts";
import { rows } from "../support/fakes/db.ts";
import { world, type FakeUser } from "../support/world.ts";

beforeEach(reset);

const senders = (count: number) => Array.from({ length: count }, (_, index) => newsletter(`Shop ${index} <news${index}@shop${index}.example>`));

async function unsubscribeFrom(address: string) {
  const sender = (await list()).body.subscriptions.find((item: { address: string }) => item.address === address);
  return call(unsubscribeRoute, { method: "POST", path: "/api/gmail/unsubscribe", body: { key: sender.key, confirmed: true } });
}

/** Records past unsubscribes for the user, as if made earlier. */
function usedUnsubscribes(user: FakeUser, count: number, when = new Date()) {
  for (let index = 0; index < count; index += 1) {
    rows("unsubscribe_usage").push({ id: `usage-${index}`, user_id: user.id, action_id: null, created_at: when.toISOString() });
  }
}

test("the plan endpoint reports the plan, its limits, and usage", async () => {
  await userWithMailbox([newsletter("News <hello@news.example.com>")]);
  const plan = await call(planRoute, { path: "/api/plan" });
  assert.equal(plan.body.plan, "free");
  assert.equal(plan.body.limits.monthlyUnsubscribes, 10);
  assert.equal(plan.body.unsubscribesThisMonth, 0);
  assert.equal(plan.body.accountsConnected, 1);
});

test("successful and manual unsubscribes count toward the limit; failed ones don't", async () => {
  await userWithMailbox([
    newsletter("A <a@one.example>"),
    newsletter("B <b@two.example>", { method: "https" }),
    newsletter("C <c@three.example>"),
  ]);
  await unsubscribeFrom("a@one.example");
  await unsubscribeFrom("b@two.example");
  world.oneClick.respond = async () => ({ kind: "rejected", status: 500 });
  await unsubscribeFrom("c@three.example");
  assert.equal((await call(planRoute, { path: "/api/plan" })).body.unsubscribesThisMonth, 2);
});

describe("Freemium", () => {
  test("refuses the 11th unsubscribe of the month and offers an upgrade", async () => {
    const { user } = await userWithMailbox([newsletter("News <hello@news.example.com>")]);
    usedUnsubscribes(user, 10);
    const result = await unsubscribeFrom("hello@news.example.com");
    assert.equal(result.status, 403);
    assert.equal(result.body.error, "You've used all 10 unsubscribes included in Freemium this month. Upgrade to Premium for unlimited unsubscribes.");
    assert.equal(result.body.upgradeRequired, true);
    assert.equal(world.oneClick.calls.length, 0);
    assert.equal((await list()).body.subscriptions[0].status, "active");
  });

  test("starts each calendar month fresh", async () => {
    const { user } = await userWithMailbox([newsletter("News <hello@news.example.com>")]);
    const lastMonth = new Date();
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    usedUnsubscribes(user, 10, lastMonth);
    assert.equal((await unsubscribeFrom("hello@news.example.com")).status, 200);
  });

  test("scans only the newest 1,500 emails", async () => {
    await userWithMailbox(senders(1600));
    const stats = (await list()).body.account.lastScanStats;
    assert.equal(stats.analyzed, 1500);
    assert.equal(stats.capped, true);
  });

  test("allows a single Gmail account", async () => {
    await userWithMailbox([]);
    const second = addGoogleAccount("second@gmail.test");
    const result = await connectGmail(second);
    assert.equal(result.location, "http://localhost:3000/connect-email?error=limit");
    assert.equal(rows("gmail_connections").length, 1);
    assert.ok(world.google.revoked.includes(second.refreshToken), "the unused grant is revoked");
  });
});

describe("Premium", () => {
  test("has no monthly unsubscribe limit", async () => {
    const { user } = await userWithMailbox([newsletter("News <hello@news.example.com>")], "premium");
    usedUnsubscribes(user, 50);
    assert.equal((await unsubscribeFrom("hello@news.example.com")).status, 200);
  });

  test("scans every email from the last 6 months", async () => {
    const user = createUser();
    signIn(user);
    setPlan(user, "premium");
    await connectGmail(addGoogleAccount("big@gmail.test", senders(1600)));
    await scan();
    const stats = (await list()).body.account.lastScanStats;
    assert.equal(stats.analyzed, 1600);
    assert.equal(stats.capped, false);
  });
});
