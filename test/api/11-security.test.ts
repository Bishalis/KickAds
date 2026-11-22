// Scenarios section 12: privacy and safety checks.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { POST as checkoutRoute } from "../../app/api/billing/checkout/route.ts";
import { POST as portalRoute } from "../../app/api/billing/portal/route.ts";
import { POST as disconnectRoute } from "../../app/api/gmail/disconnect/route.ts";
import { POST as scanRoute } from "../../app/api/gmail/route.ts";
import { GET as statusRoute } from "../../app/api/gmail/status/route.ts";
import { POST as unsubscribeRoute } from "../../app/api/gmail/unsubscribe/route.ts";
import { GET as historyRoute, PATCH as markDoneRoute } from "../../app/api/history/route.ts";
import { GET as planRoute } from "../../app/api/plan/route.ts";
import { DELETE as deleteRuleRoute, GET as rulesRoute, POST as addRuleRoute } from "../../app/api/rules/route.ts";
import { GET as subscriptionsRoute } from "../../app/api/subscriptions/route.ts";
import { call, connectionFor, createUser, keysIn, list, mail, newsletter, reset, signIn, signOut, userWithMailbox } from "../support/app.ts";
import { rows } from "../support/fakes/db.ts";
import { world } from "../support/world.ts";

beforeEach(reset);

test("every private API refuses signed-out requests", async () => {
  const endpoints: Array<[string, (request: Request) => Promise<Response>, string, string, unknown?]> = [
    ["status", statusRoute, "GET", "/api/gmail/status"],
    ["scan", scanRoute, "POST", "/api/gmail", {}],
    ["subscriptions", subscriptionsRoute, "GET", "/api/subscriptions"],
    ["unsubscribe", unsubscribeRoute, "POST", "/api/gmail/unsubscribe", { key: "a@b.co|", confirmed: true }],
    ["disconnect", disconnectRoute, "POST", "/api/gmail/disconnect", { accountId: "00000000-0000-0000-0000-000000000000" }],
    ["history", historyRoute, "GET", "/api/history"],
    ["mark done", markDoneRoute, "PATCH", "/api/history", { id: "00000000-0000-0000-0000-000000000000" }],
    ["rules", rulesRoute, "GET", "/api/rules"],
    ["add rule", addRuleRoute, "POST", "/api/rules", { kind: "protect", matchType: "address", value: "a@b.co" }],
    ["delete rule", deleteRuleRoute, "DELETE", "/api/rules?id=00000000-0000-0000-0000-000000000000"],
    ["plan", planRoute, "GET", "/api/plan"],
    ["checkout", checkoutRoute, "POST", "/api/billing/checkout"],
    ["portal", portalRoute, "POST", "/api/billing/portal"],
  ];
  for (const [name, handler, method, path, body] of endpoints) {
    const result = await call(handler, { method, path, body });
    assert.equal(result.status, 401, name);
  }
});

describe("one user can't reach another user's data", () => {
  async function twoUsers() {
    const alice = await userWithMailbox([newsletter("News <hello@news.example.com>")]);
    const aliceAccountId = String(connectionFor(alice.account)!.id);
    const [aliceSender] = (await list()).body.subscriptions;
    await call(addRuleRoute, { method: "POST", path: "/api/rules", body: { kind: "protect", matchType: "address", value: "alice-friend@example.org" } });
    const aliceUnsubscribe = await call(unsubscribeRoute, { method: "POST", path: "/api/gmail/unsubscribe", body: { key: aliceSender.key, confirmed: true } });
    const bob = await userWithMailbox([newsletter("Deals <deals@shop.example>")]);
    return { alice, bob, aliceAccountId, aliceSender, aliceActionId: aliceUnsubscribe.body.actionId as string };
  }

  test("lists, history, rules, and accounts only show the signed-in user's own", async () => {
    await twoUsers();
    assert.deepEqual(keysIn(await list()), ["deals@shop.example"]);
    assert.deepEqual((await call(historyRoute, { path: "/api/history" })).body.actions, []);
    assert.deepEqual((await call(rulesRoute, { path: "/api/rules" })).body.rules, []);
    const status = await call(statusRoute, { path: "/api/gmail/status" });
    assert.deepEqual(status.body.accounts.map((account: { googleEmail: string }) => account.googleEmail), [world.google.accounts[1].email]);
  });

  test("using another user's account id or sender is refused", async () => {
    const { alice, aliceAccountId, aliceSender, aliceActionId } = await twoUsers();
    const callsBefore = world.oneClick.calls.length;

    assert.equal((await list("subscription", aliceAccountId)).status, 404);
    const unsubscribe = await call(unsubscribeRoute, { method: "POST", path: "/api/gmail/unsubscribe", body: { accountId: aliceAccountId, key: aliceSender.key, confirmed: true } });
    assert.ok(unsubscribe.status >= 400);
    assert.equal(world.oneClick.calls.length, callsBefore);
    assert.ok((await call(markDoneRoute, { method: "PATCH", path: "/api/history", body: { id: aliceActionId } })).status >= 400);

    await call(disconnectRoute, { method: "POST", path: "/api/gmail/disconnect", body: { accountId: aliceAccountId } });
    assert.ok(connectionFor(alice.account), "Alice's account is untouched");
  });
});

test("no response ever contains a Google token", async () => {
  const { account } = await userWithMailbox([newsletter("News <hello@news.example.com>")]);
  const responses = await Promise.all([
    call(statusRoute, { path: "/api/gmail/status" }),
    list(), list("protected"),
    call(planRoute, { path: "/api/plan" }),
    call(historyRoute, { path: "/api/history" }),
  ]);
  const serialized = JSON.stringify(responses);
  assert.ok(!serialized.includes(account.refreshToken));
  assert.ok(!serialized.includes("encrypted_refresh_token"));
  assert.ok(!serialized.includes(String(connectionFor(account)!.encrypted_refresh_token)));
});

test("KickAds only ever reads Gmail, never changes it", async () => {
  await userWithMailbox([newsletter("News <hello@news.example.com>"), mail("Shop <info@shop.example>", "Hi", { html: "<a href=\"https://shop.example/unsubscribe\">Unsubscribe</a>" })]);
  const [sender] = (await list()).body.subscriptions;
  await call(unsubscribeRoute, { method: "POST", path: "/api/gmail/unsubscribe", body: { key: sender.key, confirmed: true } });
  const methods = new Set(world.google.calls.map((item) => item.method));
  assert.deepEqual([...methods].sort(), ["get", "list", "profile"]);
});

test("signing out ends access immediately", async () => {
  await userWithMailbox([newsletter("News <hello@news.example.com>")]);
  signOut();
  assert.equal((await list()).status, 401);
  signIn(createUser());
  assert.equal(rows("email_subscriptions").length, 1, "the data still exists, just not for them");
  assert.equal((await list()).body.account, null);
});
