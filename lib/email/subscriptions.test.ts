import assert from "node:assert/strict";
import test from "node:test";
import { buildSenderGroups, type SenderRule } from "./classifier.ts";
import { statusAfterAttempt, tabFilter, toSubscriptionRow, toSubscriptionView, type StoredSubscription, type SubscriptionRow } from "./subscriptions.ts";
import { emptyContext, message, newsletterHeaders } from "./test-fixtures.ts";

const [newsletter] = buildSenderGroups([message({ from: "News <hello@news.example.com>", subject: "Weekly", headers: newsletterHeaders })], emptyContext);

// What Postgres computes for the generated `classification` column.
function stored(row: SubscriptionRow, extra: Partial<StoredSubscription> = {}): StoredSubscription {
  return { ...row, id: "s1", classification: row.protected_by ? "protected" : row.base_classification, status: "active", unsubscribed_at: null, ...extra };
}

test("only a successful attempt marks a sender unsubscribed", () => {
  assert.equal(statusAfterAttempt("success"), "unsubscribed");
  for (const result of ["failed", "manual_required", "no_method", "blocked"] as const) {
    assert.equal(statusAfterAttempt(result), "active", result);
  }
});

test("protected senders are filtered out of every list except the Protected page", () => {
  for (const tab of ["subscription", "review", "ignored"] as const) {
    const filter = tabFilter(tab);
    assert.equal(filter.excludeProtected, true, tab);
    assert.notEqual(filter.classification, "protected", tab);
  }
  assert.deepEqual(tabFilter("protected"), { classification: "protected", excludeProtected: false, ignored: null });
});

test("a user protect rule is stored on top of the scan's own classification", () => {
  const rules: SenderRule[] = [{ id: "r1", kind: "protect", matchType: "domain", value: "example.com" }];
  const row = toSubscriptionRow(newsletter, rules);
  assert.equal(row.base_classification, "subscription");
  assert.equal(row.protected_by, "domain");
  const view = toSubscriptionView(stored(row));
  assert.equal(view.classification, "protected");
  // Even if the stored execution says otherwise, a protected sender can't be unsubscribed from.
  assert.equal(view.execution, "none");
  // Removing the rule restores the scan's classification without a rescan.
  assert.equal(toSubscriptionView(stored({ ...row, protected_by: null })).classification, "subscription");
});

test("stored rows and browser views carry no subjects, bodies, or unsubscribe URLs", () => {
  const serialized = JSON.stringify([toSubscriptionRow(newsletter, []), toSubscriptionView(stored(toSubscriptionRow(newsletter, [])))]);
  assert.doesNotMatch(serialized, /https:\/\//);
  assert.doesNotMatch(serialized, /Weekly"/);
});

test("still-sending is flagged only when mail keeps arriving well after unsubscribing", () => {
  const row = toSubscriptionRow(newsletter, []);
  const unsubscribedAt = new Date(Date.parse(row.last_received_at) - 86_400_000).toISOString();
  assert.equal(toSubscriptionView(stored(row, { status: "unsubscribed", unsubscribed_at: unsubscribedAt })).stillSending, false);
  const longAgo = new Date(Date.parse(row.last_received_at) - 10 * 86_400_000).toISOString();
  assert.equal(toSubscriptionView(stored(row, { status: "unsubscribed", unsubscribed_at: longAgo })).stillSending, true);
});
