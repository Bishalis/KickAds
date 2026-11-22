import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { list, newsletter, reset, userWithMailbox } from "../support/app.ts";

beforeEach(reset);

test("smoke: connect, scan, and list", async () => {
  await userWithMailbox([newsletter("News <hello@news.example.com>"), newsletter("News <hello@news.example.com>", { daysAgo: 8 })]);
  const result = await list();
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(result.body.subscriptions.map((s: { address: string }) => s.address), ["hello@news.example.com"]);
});
