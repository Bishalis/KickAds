// Scenarios sections 2 and 3: signing in doesn't grant Gmail access; connecting and disconnecting Gmail.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { GET as connectRoute } from "../../app/api/gmail/connect/route.ts";
import { GET as callbackRoute } from "../../app/api/gmail/callback/route.ts";
import { POST as disconnectRoute } from "../../app/api/gmail/disconnect/route.ts";
import { GET as statusRoute } from "../../app/api/gmail/status/route.ts";
import { gmailReadonlyScope } from "../../lib/email/google-oauth.ts";
import { addGoogleAccount, call, connectGmail, connectionFor, createUser, list, reset, signIn } from "../support/app.ts";
import { rows } from "../support/fakes/db.ts";
import { world } from "../support/world.ts";

beforeEach(() => {
  reset();
  signIn(createUser());
});

test("a signed-in user without Connect Gmail has no Gmail access", async () => {
  const status = await call(statusRoute, { path: "/api/gmail/status" });
  assert.equal(status.body.gmailConnected, false);
  assert.deepEqual(status.body.accounts, []);
  const subscriptions = await list();
  assert.equal(subscriptions.body.account, null);
  assert.equal(world.google.calls.length, 0);
});

describe("connect Gmail", () => {
  test("requires signing in first", async () => {
    world.session = null;
    const result = await call(connectRoute, { path: "/api/gmail/connect" });
    assert.equal(result.location, "http://localhost:3000/auth/login");
  });

  test("asks Google for read-only Gmail access and nothing more", async () => {
    const result = await call(connectRoute, { path: "/api/gmail/connect" });
    const url = new URL(result.location!);
    assert.equal(url.searchParams.get("scope"), gmailReadonlyScope);
    assert.equal(url.searchParams.get("access_type"), "offline");
    assert.ok(url.searchParams.get("state"));
  });

  test("approving stores the account with its token encrypted", async () => {
    const account = addGoogleAccount("alex@gmail.test");
    const result = await connectGmail(account);
    assert.equal(result.location, "http://localhost:3000/connect-email?connected=true");
    const connection = connectionFor(account)!;
    assert.ok(connection);
    assert.ok(!String(connection.encrypted_refresh_token).includes(account.refreshToken), "the token must not be stored as plain text");
  });

  test("cancelling on Google's screen stores nothing", async () => {
    const result = await connectGmail(addGoogleAccount("alex@gmail.test"), { denied: true });
    assert.equal(result.location, "http://localhost:3000/connect-email?error=denied");
    assert.equal(rows("gmail_connections").length, 0);
  });

  test("unticking Gmail access is refused and the grant is revoked", async () => {
    const account = addGoogleAccount("alex@gmail.test");
    const result = await connectGmail(account, { scope: "openid email" });
    assert.equal(result.location, "http://localhost:3000/connect-email?error=scope");
    assert.equal(rows("gmail_connections").length, 0);
    assert.deepEqual(world.google.revoked, [account.refreshToken]);
  });

  test("a forged or expired request is refused", async () => {
    await call(connectRoute, { path: "/api/gmail/connect" });
    const result = await call(callbackRoute, { path: "/api/gmail/callback?state=forged&code=anything" });
    assert.equal(result.location, "http://localhost:3000/connect-email?error=expired");
    assert.equal(rows("gmail_connections").length, 0);
  });

  test("reconnecting the same account keeps a single entry", async () => {
    const account = addGoogleAccount("alex@gmail.test");
    await connectGmail(account);
    await connectGmail(account);
    assert.equal(rows("gmail_connections").length, 1);
  });
});

describe("disconnect Gmail", () => {
  test("removes the account and revokes access at Google", async () => {
    const account = addGoogleAccount("alex@gmail.test");
    await connectGmail(account);
    const result = await call(disconnectRoute, { method: "POST", path: "/api/gmail/disconnect", body: { accountId: connectionFor(account)!.id } });
    assert.equal(result.status, 200);
    assert.equal(rows("gmail_connections").length, 0);
    assert.deepEqual(world.google.revoked, [account.refreshToken]);
  });

  test("needs to know which account", async () => {
    const result = await call(disconnectRoute, { method: "POST", path: "/api/gmail/disconnect", body: {} });
    assert.equal(result.status, 400);
  });
});
