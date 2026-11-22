// Scenarios section 5: how senders are sorted into Subscriptions, Needs review, and Protected.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { keysIn, list, mail, newsletter, reset, sentTo, userWithMailbox } from "../support/app.ts";

beforeEach(reset);

async function allTabs() {
  const [subscription, review, protectedTab, ignored] = await Promise.all([list("subscription"), list("review"), list("protected"), list("ignored")]);
  return { subscription, review, protected: protectedTab, ignored };
}

test("senders are grouped by address, not by company or platform", async () => {
  await userWithMailbox([
    newsletter("Alpha <alpha@substack.example>"),
    newsletter("Beta <beta@substack.example>"),
  ]);
  assert.deepEqual(keysIn(await list()).sort(), ["alpha@substack.example", "beta@substack.example"]);
});

test("verified newsletters land in Subscriptions", async () => {
  await userWithMailbox([newsletter("News <hello@news.example.com>"), newsletter("News <hello@news.example.com>", { daysAgo: 8 })]);
  const [sender] = (await list()).body.subscriptions;
  assert.equal(sender.address, "hello@news.example.com");
  assert.equal(sender.classification, "subscription");
});

test("bank, order, and security mail never lands in Subscriptions, even with an unsubscribe link", async () => {
  await userWithMailbox([
    mail("Bank <alerts@bank.example>", "Your statement is ready"),
    newsletter("Bank News <news@bank.example>", { subject: "Your monthly statement" }),
    mail("Shop <orders@shop.example>", "Your order has shipped"),
    mail("Accounts <security@service.example>", "Password reset requested"),
  ]);
  const tabs = await allTabs();
  assert.deepEqual(keysIn(tabs.subscription), []);
  const elsewhere = [...keysIn(tabs.review), ...keysIn(tabs.protected)].sort();
  assert.deepEqual(elsewhere, ["alerts@bank.example", "news@bank.example", "orders@shop.example", "security@service.example"]);
});

test("people you email are protected, with the reason shown", async () => {
  await userWithMailbox([mail("Pat <pat@friend.example>", "Weekend plans"), sentTo("pat@friend.example")]);
  const [sender] = (await list("protected")).body.subscriptions;
  assert.equal(sender.address, "pat@friend.example");
  assert.ok(sender.reasons.includes("You have sent email to this address"));
});

test("personal mailboxes are protected", async () => {
  await userWithMailbox([mail("Mum <mum@gmail.com>", "Our daily walk")]);
  assert.deepEqual(keysIn(await list("protected")), ["mum@gmail.com"]);
});

test("unverified senders need review rather than being offered for unsubscribe", async () => {
  await userWithMailbox([newsletter("Lookalike <news@shop.example>", { verified: false })]);
  const [sender] = (await list("review")).body.subscriptions;
  assert.equal(sender.address, "news@shop.example");
  assert.ok(sender.reasons.some((reason: string) => reason.includes("could not verify the sender")));
});

test("every sender explains why it was sorted the way it was", async () => {
  await userWithMailbox([newsletter("News <hello@news.example.com>"), mail("Mum <mum@gmail.com>", "Hi"), mail("Someone <a@unknown.example>", "Hello")]);
  const tabs = await allTabs();
  for (const sender of [...tabs.subscription.body.subscriptions, ...tabs.review.body.subscriptions, ...tabs.protected.body.subscriptions]) {
    assert.ok(sender.reasons.length > 0, sender.address);
    assert.ok(["high", "medium", "low"].includes(sender.confidence), sender.address);
  }
});

test("tab counts match the lists and the overview totals", async () => {
  await userWithMailbox([
    newsletter("News <hello@news.example.com>"),
    newsletter("Deals <deals@shop.example>"),
    mail("Mum <mum@gmail.com>", "Hi"),
    mail("Someone <a@unknown.example>", "Hello"),
  ]);
  const tabs = await allTabs();
  const counts = tabs.subscription.body.counts;
  assert.equal(counts.subscription, tabs.subscription.body.subscriptions.length);
  assert.equal(counts.review, tabs.review.body.subscriptions.length);
  assert.equal(counts.protected, tabs.protected.body.subscriptions.length);
  const stats = tabs.subscription.body.account.lastScanStats;
  assert.deepEqual([stats.subscriptions, stats.protected, stats.review], [counts.subscription, counts.protected, counts.review]);
});

test("responses carry no email subjects, bodies, unsubscribe links, or message ids", async () => {
  await userWithMailbox([
    newsletter("News <hello@news.example.com>", { subject: "SECRET-SUBJECT-1" }),
    mail("Shop <info@shop.example>", "SECRET-SUBJECT-2", { html: '<a href="https://shop.example/unsubscribe">Unsubscribe</a> SECRET-BODY' }),
  ]);
  const serialized = JSON.stringify(await allTabs());
  assert.doesNotMatch(serialized, /SECRET-/);
  assert.doesNotMatch(serialized, /https:\/\//);
  assert.doesNotMatch(serialized, /msg-\d+/);
});
