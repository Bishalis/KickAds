// Scenarios section 4: first scan, what gets scanned, loading without rescanning, batches.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { POST as scanRoute } from "../../app/api/gmail/route.ts";
import {
  addGoogleAccount, allowRescan, call, connectGmail, connectionFor, createUser, keysIn, list, mail, newsletter,
  reset, scan, sentTo, setPlan, signIn, userWithMailbox,
} from "../support/app.ts";
import { rows } from "../support/fakes/db.ts";
import { world } from "../support/world.ts";

beforeEach(reset);

function manySenders(count: number) {
  return Array.from({ length: count }, (_, index) => newsletter(`Shop ${index} <deals${index}@shop${index}.example>`, { daysAgo: 1 + (index % 150) }));
}

test("the first scan stores every recent sender", async () => {
  await userWithMailbox([
    newsletter("News <hello@news.example.com>"),
    newsletter("Deals <deals@shop.example>"),
  ]);
  assert.equal(rows("email_subscriptions").length, 2);
  assert.deepEqual(keysIn(await list()).sort(), ["deals@shop.example", "hello@news.example.com"]);
});

test("sent mail and mail older than 6 months are not scanned", async () => {
  await userWithMailbox([
    newsletter("News <hello@news.example.com>"),
    newsletter("Old News <old@stale.example>", { daysAgo: 250 }),
    sentTo("friend@example.org"),
  ]);
  const addresses = rows("email_subscriptions").map((row) => row.address);
  assert.deepEqual(addresses, ["hello@news.example.com"]);
});

test("opening the list reads saved results without calling Gmail", async () => {
  await userWithMailbox([newsletter("News <hello@news.example.com>")]);
  const callsAfterScan = world.google.calls.length;
  await list();
  await list("review");
  await list("protected");
  assert.equal(world.google.calls.length, callsAfterScan);
});

test("rescanning within 15 seconds is refused", async () => {
  await userWithMailbox([newsletter("News <hello@news.example.com>")]);
  const { final } = await scan();
  assert.equal(final.status, 429);
  assert.equal(final.body.error, "A scan just finished. Please wait a few seconds before scanning again.");
});

test("a rescan picks up new senders and drops ones that went quiet", async () => {
  const { account } = await userWithMailbox([newsletter("News <hello@news.example.com>")]);
  account.messages = [newsletter("Fresh <hi@fresh.example>")];
  allowRescan();
  await scan();
  assert.deepEqual(keysIn(await list()), ["hi@fresh.example"]);
});

describe("large inboxes", () => {
  test("are scanned in batches, carried by a scan cursor", async () => {
    const user = createUser();
    signIn(user);
    setPlan(user, "premium");
    await connectGmail(addGoogleAccount("big@gmail.test", manySenders(2500)));
    const { final, batches } = await scan();
    assert.equal(batches.length, 3);
    assert.equal(batches[0].body.done, false);
    assert.ok(batches[0].body.cursor);
    assert.equal(final.body.scanned, 2500);
  });

  test("a tampered scan cursor is refused", async () => {
    signIn(createUser());
    await connectGmail(addGoogleAccount("me@gmail.test", manySenders(10)));
    const result = await call(scanRoute, { method: "POST", path: "/api/gmail", body: { cursor: "made-up" } });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, "This scan expired. Please start a new scan.");
  });

  test("another user's scan cursor is refused", async () => {
    const alice = createUser();
    signIn(alice);
    await connectGmail(addGoogleAccount("alice@gmail.test", manySenders(1200)));
    const first = await call(scanRoute, { method: "POST", path: "/api/gmail", body: {} });
    assert.equal(first.body.done, false);

    signIn(createUser());
    await connectGmail(addGoogleAccount("bob@gmail.test", manySenders(10)));
    const stolen = await call(scanRoute, { method: "POST", path: "/api/gmail", body: { cursor: first.body.cursor } });
    assert.equal(stolen.status, 400);
  });
});

test("revoked Google access asks the user to reconnect and removes the connection", async () => {
  const { account } = await userWithMailbox([newsletter("News <hello@news.example.com>")]);
  account.revoked = true;
  allowRescan();
  const { final } = await scan();
  assert.equal(final.status, 401);
  assert.equal(final.body.error, "Gmail access expired or was revoked. Please reconnect Gmail.");
  assert.equal(connectionFor(account), undefined);
});

test("scanning without a connected Gmail account says so", async () => {
  signIn(createUser());
  const { final } = await scan();
  assert.equal(final.status, 400);
  assert.equal(final.body.gmailConnected, false);
});

test("personal and protected senders never have their email bodies fetched", async () => {
  await userWithMailbox([
    mail("Mum <mum@gmail.com>", "Dinner on Sunday?"),
    mail("Bank <alerts@bank.example>", "Your statement is ready"),
    mail("Shop <info@shop.example>", "New arrivals", { html: '<a href="https://shop.example/unsubscribe">Unsubscribe</a>' }),
  ]);
  const fullFetches = world.google.calls.filter((item) => item.format === "full").map((item) => item.id);
  const fetchedFrom = fullFetches.map((id) => world.google.accounts[0].messages.find((message) => message.id === id)?.from);
  assert.deepEqual(fetchedFrom, ["Shop <info@shop.example>"]);
});
