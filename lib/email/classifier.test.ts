import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSenderGroups,
  evaluateUnsubscribe,
  finalizeGroups,
  foldMessages,
  getScanStats,
  toSenderSummary,
  type ScanContext,
  type ScannedMessage,
  type SenderRule,
} from "./classifier.ts";

type HeaderList = Array<[string, string]>;

let nextId = 0;
function message(options: { from: string; subject: string; headers?: HeaderList; labels?: string[]; daysAgo?: number; bodyUnsubscribeUrl?: string }): ScannedMessage {
  nextId += 1;
  return {
    id: `m${nextId}`,
    internalDate: Date.parse("2026-09-25T00:00:00Z") - (options.daysAgo ?? 0) * 86_400_000,
    labelIds: options.labels ?? [],
    bodyUnsubscribeUrl: options.bodyUnsubscribeUrl,
    headers: [["From", options.from], ["Subject", options.subject], ...(options.headers ?? [])].map(([name, value]) => ({ name, value })),
  };
}

function verified(domain: string, signsListHeaders = true): HeaderList {
  return [
    ["Authentication-Results", `mx.google.com; dkim=pass header.i=@${domain} header.s=s1; spf=pass smtp.mailfrom=${domain}; dmarc=pass (p=NONE) header.from=${domain}`],
    ["DKIM-Signature", `v=1; a=rsa-sha256; d=${domain}; s=s1; h=From:Subject:Date${signsListHeaders ? ":List-Unsubscribe:List-Unsubscribe-Post" : ""}; bh=x; b=y`],
  ];
}

function oneClick(url: string): HeaderList {
  return [["List-Unsubscribe", `<${url}>, <mailto:unsub@example.com>`], ["List-Unsubscribe-Post", "List-Unsubscribe=One-Click"]];
}

const newsletterHeaders: HeaderList = [...oneClick("https://news.example.com/u/abc"), ["List-ID", "Weekly <weekly.news.example.com>"], ...verified("news.example.com")];
const emptyContext: ScanContext = { rules: [], correspondents: new Set() };
const confirm = { confirmed: true, acknowledgeReview: false };

function single(messages: ScannedMessage[], context = emptyContext) {
  const groups = buildSenderGroups(messages, context);
  assert.equal(groups.length, 1);
  return groups[0];
}

test("a verified, DKIM-signed one-click newsletter is a high-confidence automatic candidate", () => {
  const group = single([
    message({ from: "Example News <hello@news.example.com>", subject: "This week in tech", headers: newsletterHeaders }),
    message({ from: "Example News <hello@news.example.com>", subject: "Last week in tech", headers: newsletterHeaders, daysAgo: 7 }),
  ]);
  assert.equal(group.classification, "subscription");
  assert.equal(group.confidence, "high");
  assert.deepEqual(evaluateUnsubscribe(group, confirm), { outcome: "automatic", url: "https://news.example.com/u/abc" });
});

test("classification alone never unsubscribes: explicit confirmation is required", () => {
  const group = single([message({ from: "hello@news.example.com", subject: "Weekly", headers: newsletterHeaders })]);
  assert.equal(evaluateUnsubscribe(group, { confirmed: false, acknowledgeReview: false }).outcome, "blocked");
});

test("an unverified sender with list headers goes to review and is never automatic", () => {
  const headers = newsletterHeaders.filter(([name]) => name !== "Authentication-Results");
  const group = single([message({ from: "hello@news.example.com", subject: "Big sale", headers })]);
  assert.equal(group.classification, "review");
  assert.equal(evaluateUnsubscribe(group, confirm).outcome, "blocked");
  assert.equal(evaluateUnsubscribe(group, { confirmed: true, acknowledgeReview: true }).outcome, "manual");
});

test("Authentication-Results added by another hop is not trusted", () => {
  const forged: HeaderList = [
    ...oneClick("https://news.example.com/u"),
    ["Authentication-Results", "evil.example; dkim=pass header.i=@news.example.com; dmarc=pass header.from=news.example.com"],
  ];
  assert.equal(single([message({ from: "hello@news.example.com", subject: "Deals", headers: forged })]).authentication.verified, false);
});

test("one-click is only automatic when DKIM covers the List-Unsubscribe headers", () => {
  const headers: HeaderList = [...oneClick("https://news.example.com/u"), ["List-ID", "<weekly.news.example.com>"], ...verified("news.example.com", false)];
  const group = single([message({ from: "hello@news.example.com", subject: "Weekly", headers })]);
  assert.equal(group.classification, "subscription");
  assert.equal(evaluateUnsubscribe(group, confirm).outcome, "manual");
});

test("a bank alert with one-click in Gmail's Updates category needs review", () => {
  const headers: HeaderList = [...oneClick("https://alerts.bank.example/u"), ...verified("alerts.bank.example")];
  const group = single([
    message({ from: "Bank <alerts@alerts.bank.example>", subject: "Daily summary", headers, labels: ["CATEGORY_UPDATES"] }),
    message({ from: "Bank <alerts@alerts.bank.example>", subject: "Daily summary", headers, labels: ["CATEGORY_UPDATES"], daysAgo: 1 }),
  ]);
  assert.equal(group.classification, "review");
});

test("important subjects push a list to review and non-list mail to protected", () => {
  const listGroup = single([message({ from: "billing@shop.example", subject: "Your invoice is ready", headers: [...oneClick("https://shop.example/u"), ...verified("shop.example")] })]);
  assert.equal(listGroup.classification, "review");
  const plainGroup = single([message({ from: "billing@shop.example", subject: "Your invoice is ready" })]);
  assert.equal(plainGroup.classification, "protected");
  assert.equal(evaluateUnsubscribe(plainGroup, { confirmed: true, acknowledgeReview: true }).outcome, "blocked");
});

test("a single keyword without list signals never makes something a subscription", () => {
  const group = single([message({ from: "Mom <mom@gmail.com>", subject: "Our daily walk" })]);
  assert.equal(group.classification, "protected");
  assert.match(group.reasons.join(" "), /personal mailbox/);
});

test("people you email are protected even when they send list mail", () => {
  const context: ScanContext = { rules: [], correspondents: new Set(["jane@company.example"]) };
  assert.equal(single([message({ from: "jane@company.example", subject: "Notes" })], context).classification, "protected");
  assert.equal(single([message({ from: "jane@company.example", subject: "Notes", headers: newsletterHeaders })], context).classification, "review");
});

test("promotional words in a subject don't create protection; only subjects are checked", () => {
  const group = single([
    message({ from: "deals@shop.example", subject: "50% off everything", headers: [...oneClick("https://shop.example/u"), ...verified("shop.example")], labels: ["CATEGORY_PROMOTIONS"] }),
  ]);
  assert.equal(group.classification, "subscription");
});

test("user protection by domain covers subdomains and blocks unsubscribe", () => {
  const rules: SenderRule[] = [{ id: "r1", kind: "protect", matchType: "domain", value: "example.com" }];
  const group = single([message({ from: "hello@news.example.com", subject: "Weekly", headers: newsletterHeaders })], { rules, correspondents: new Set() });
  assert.equal(group.classification, "protected");
  assert.equal(toSenderSummary(group).protectedBy, "domain");
  assert.equal(evaluateUnsubscribe(group, { confirmed: true, acknowledgeReview: true }).outcome, "blocked");
});

test("ignored senders are hidden from counts but still classified", () => {
  const rules: SenderRule[] = [{ id: "r1", kind: "ignore", matchType: "address", value: "hello@news.example.com" }];
  const groups = buildSenderGroups([message({ from: "hello@news.example.com", subject: "Weekly", headers: newsletterHeaders })], { rules, correspondents: new Set() });
  assert.equal(toSenderSummary(groups[0]).ignored, true);
  assert.deepEqual(getScanStats(groups, false), { analyzed: 1, senders: 1, subscriptions: 0, protected: 0, review: 0, ignored: 1, capped: false });
});

test("groups by address and List-ID, never by domain alone", () => {
  const groups = buildSenderGroups([
    message({ from: "a@substack.example", subject: "Post", headers: [["List-ID", "<a.substack.example>"]] }),
    message({ from: "b@substack.example", subject: "Post", headers: [["List-ID", "<b.substack.example>"]] }),
    message({ from: "hello@news.example.com", subject: "Weekly", headers: newsletterHeaders }),
    message({ from: "hello@news.example.com", subject: "Your password was reset" }),
  ], emptyContext);
  assert.deepEqual(groups.map((group) => group.key).toSorted(), [
    "a@substack.example|a.substack.example",
    "b@substack.example|b.substack.example",
    "hello@news.example.com|",
    "hello@news.example.com|weekly.news.example.com",
  ]);
  assert.equal(groups.find((group) => group.key === "hello@news.example.com|")?.classification, "protected");
});

test("the newest message's unsubscribe endpoint is used", () => {
  const group = single([
    message({ from: "hello@news.example.com", subject: "Old", headers: [...oneClick("https://news.example.com/old"), ["List-ID", "<l.example>"], ...verified("news.example.com")], daysAgo: 30 }),
    message({ from: "hello@news.example.com", subject: "New", headers: [...oneClick("https://news.example.com/new"), ["List-ID", "<l.example>"], ...verified("news.example.com")] }),
  ]);
  assert.equal(group.unsubscribe.url, "https://news.example.com/new");
});

test("mailto-only lists are manual and keep the required subject", () => {
  const headers: HeaderList = [["List-Unsubscribe", "<mailto:leave@list.example?subject=unsubscribe>"], ["List-ID", "<l.list.example>"], ...verified("list.example")];
  const decision = evaluateUnsubscribe(single([message({ from: "digest@list.example", subject: "Digest", headers })]), confirm);
  assert.deepEqual(decision, { outcome: "manual", method: "mailto", url: undefined, mailto: "mailto:leave@list.example?subject=unsubscribe" });
});

test("a body link alone is not enough to call something a subscription", () => {
  const group = single([message({ from: "info@shop.example", subject: "Hello", bodyUnsubscribeUrl: "https://shop.example/unsubscribe" })]);
  assert.equal(group.classification, "review");
  assert.equal(evaluateUnsubscribe(group, { confirmed: true, acknowledgeReview: true }).outcome, "manual");
});

test("no unsubscribe method is reported as such", () => {
  const group = single([message({ from: "info@shop.example", subject: "Hello" })]);
  assert.equal(evaluateUnsubscribe(group, { confirmed: true, acknowledgeReview: true }).outcome, "no_method");
});

test("summaries sent to the browser carry no URLs or message IDs", () => {
  const summary = toSenderSummary(single([message({ from: "hello@news.example.com", subject: "Weekly", headers: newsletterHeaders })]));
  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(serialized, /https:\/\//);
  assert.doesNotMatch(serialized, /"m\d+"/);
});

test("folding messages in batches gives the same result as all at once", () => {
  const messages = [
    message({ from: "hello@news.example.com", subject: "Weekly 1", headers: newsletterHeaders, daysAgo: 2 }),
    message({ from: "hello@news.example.com", subject: "Weekly 2", headers: newsletterHeaders }),
    message({ from: "billing@shop.example", subject: "Your invoice" }),
    message({ from: "hello@news.example.com", subject: "Weekly 3", headers: newsletterHeaders, daysAgo: 9 }),
  ];
  const batched = foldMessages(foldMessages({}, messages.slice(0, 2)), messages.slice(2));
  // Round-trip through JSON the way the encrypted scan cursor does between batches.
  const restored = JSON.parse(JSON.stringify(batched)) as typeof batched;
  assert.deepEqual(finalizeGroups(restored, emptyContext), buildSenderGroups(messages, emptyContext));
  const newsletter = finalizeGroups(restored, emptyContext).find((group) => group.address === "hello@news.example.com");
  assert.equal(newsletter?.emailCount, 3);
  assert.deepEqual(newsletter?.sampleSubjects, ["Weekly 2", "Weekly 1", "Weekly 3"]);
});
