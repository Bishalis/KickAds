// Scenarios section 10: multiple Gmail accounts on Premium.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { POST as disconnectRoute } from "../../app/api/gmail/disconnect/route.ts";
import { GET as statusRoute } from "../../app/api/gmail/status/route.ts";
import { POST as unsubscribeRoute } from "../../app/api/gmail/unsubscribe/route.ts";
import { GET as historyRoute } from "../../app/api/history/route.ts";
import {
  addGoogleAccount, call, connectGmail, connectionFor, createUser, keysIn, list, newsletter, reset, scan, setPlan, signIn,
} from "../support/app.ts";
import { rows } from "../support/fakes/db.ts";
import { type FakeGoogleAccount, type FakeUser } from "../support/world.ts";

let user: FakeUser;
let first: FakeGoogleAccount;
let second: FakeGoogleAccount;

beforeEach(async () => {
  reset();
  user = createUser();
  signIn(user);
  setPlan(user, "premium");
  first = addGoogleAccount("first@gmail.test", [newsletter("News <hello@news.example.com>")]);
  second = addGoogleAccount("second@gmail.test", [newsletter("Deals <deals@shop.example>")]);
  await connectGmail(first);
  await connectGmail(second);
});

const idOf = (account: FakeGoogleAccount) => String(connectionFor(account)!.id);

test("Premium connects up to 3 accounts and refuses a 4th", async () => {
  assert.equal((await connectGmail(addGoogleAccount("third@gmail.test"))).location, "http://localhost:3000/connect-email?connected=true");
  assert.equal((await connectGmail(addGoogleAccount("fourth@gmail.test"))).location, "http://localhost:3000/connect-email?error=limit");
  assert.equal(rows("gmail_connections").length, 3);
});

test("each account is scanned and listed separately", async () => {
  await scan(idOf(first));
  await scan(idOf(second));
  assert.deepEqual(keysIn(await list("subscription", idOf(first))), ["hello@news.example.com"]);
  assert.deepEqual(keysIn(await list("subscription", idOf(second))), ["deals@shop.example"]);
});

test("History records which account an unsubscribe came from", async () => {
  await scan(idOf(second));
  const [sender] = (await list("subscription", idOf(second))).body.subscriptions;
  await call(unsubscribeRoute, { method: "POST", path: "/api/gmail/unsubscribe", body: { accountId: idOf(second), key: sender.key, confirmed: true } });
  const [entry] = (await call(historyRoute, { path: "/api/history" })).body.actions;
  assert.equal(entry.accountEmail, "second@gmail.test");
});

test("after a downgrade, only the first account stays usable, and the others can still be disconnected", async () => {
  setPlan(user, "free");
  const status = await call(statusRoute, { path: "/api/gmail/status" });
  assert.deepEqual(status.body.accounts.map((account: { googleEmail: string; locked: boolean }) => [account.googleEmail, account.locked]), [
    ["first@gmail.test", false],
    ["second@gmail.test", true],
  ]);

  const locked = await scan(idOf(second));
  assert.equal(locked.final.status, 403);
  assert.equal(locked.final.body.upgradeRequired, true);
  assert.deepEqual((await list("subscription", idOf(second))).body.subscriptions, []);

  const disconnected = await call(disconnectRoute, { method: "POST", path: "/api/gmail/disconnect", body: { accountId: idOf(second) } });
  assert.equal(disconnected.status, 200);
  assert.equal(rows("gmail_connections").length, 1);
});

test("disconnecting an account removes its saved senders", async () => {
  await scan(idOf(second));
  await call(disconnectRoute, { method: "POST", path: "/api/gmail/disconnect", body: { accountId: idOf(second) } });
  assert.ok(rows("email_subscriptions").every((row) => row.address !== "deals@shop.example"));
});
