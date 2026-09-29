import assert from "node:assert/strict";
import test from "node:test";
import { isPublicAddress } from "./safe-fetch.ts";
import { decodeEncodedWords, normalizeSender } from "./sender.ts";
import { extractBodyUnsubscribeUrl, parseListUnsubscribe, parseUnsubscribeUrl } from "./unsubscribe.ts";

const headers = (entries: Array<[string, string]>) => entries.map(([name, value]) => ({ name, value }));

test("normalizes common From header shapes", () => {
  assert.deepEqual(normalizeSender('"Doe, Jane" <JANE@Example.COM>'), { displayName: "Doe, Jane", email: "jane@example.com", domain: "example.com" });
  assert.deepEqual(normalizeSender("jane@example.com (Jane Doe)"), { displayName: "Jane Doe", email: "jane@example.com", domain: "example.com" });
  assert.deepEqual(normalizeSender("<news@example.com>"), { displayName: "news", email: "news@example.com", domain: "example.com" });
  assert.equal(normalizeSender("Undisclosed").email, "");
});

test("decodes RFC 2047 display names", () => {
  assert.equal(decodeEncodedWords("=?UTF-8?B?Q2Fmw6k=?= News"), "Café News");
  assert.equal(decodeEncodedWords("=?ISO-8859-1?Q?Caf=E9_News?="), "Café News");
});

test("only plain HTTPS URLs on real hostnames are accepted", () => {
  assert.ok(parseUnsubscribeUrl("https://example.com/unsubscribe?t=1"));
  for (const url of ["http://example.com/u", "https://user:pw@example.com/u", "https://example.com:8443/u", "https://169.254.169.254/u", "https://[::1]/u", "https://localhost/u", "javascript:alert(1)"]) {
    assert.equal(parseUnsubscribeUrl(url), null, url);
  }
});

test("List-Unsubscribe prefers HTTPS, needs the exact one-click header, and falls back to mailto", () => {
  assert.deepEqual(parseListUnsubscribe(headers([["List-Unsubscribe", "<mailto:u@example.com>, <https://example.com/u>"], ["List-Unsubscribe-Post", " List-Unsubscribe = One-Click "]])), { method: "one_click", url: "https://example.com/u" });
  assert.equal(parseListUnsubscribe(headers([["List-Unsubscribe", "<https://example.com/u>"], ["List-Unsubscribe-Post", "List-Unsubscribe=One-Click; evil"]])).method, "https");
  assert.deepEqual(parseListUnsubscribe(headers([["List-Unsubscribe", "<http://example.com/u>, <mailto:u@example.com>"]])), { method: "mailto", mailto: "mailto:u@example.com" });
  assert.deepEqual(parseListUnsubscribe(headers([["List-Unsubscribe", "<ftp://example.com>"]])), { method: "none" });
});

test("body links need unsubscribe wording or an unsubscribe path", () => {
  assert.equal(extractBodyUnsubscribeUrl('<a href="https://example.com/logo">Brand</a><a href="https://e.example.com/u?a=1&amp;b=2">Unsubscribe</a>', ""), "https://e.example.com/u?a=1&b=2");
  assert.equal(extractBodyUnsubscribeUrl('<a href="https://example.com/product">View product</a>', ""), undefined);
  assert.equal(extractBodyUnsubscribeUrl("", "Visit https://example.com/home. To unsubscribe, reply STOP."), undefined);
  assert.equal(extractBodyUnsubscribeUrl("", "Unsubscribe: https://example.com/unsubscribe/abc."), "https://example.com/unsubscribe/abc");
});

test("private, loopback, link-local, and reserved addresses are not public", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "not-an-ip"]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress("93.184.216.34"), true);
  assert.equal(isPublicAddress("2606:4700::1111"), true);
});
