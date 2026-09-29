import assert from "node:assert/strict";
import test from "node:test";
import { decodeScanState, encodeScanState, type ScanState } from "./scan-state.ts";

process.env.GOOGLE_TOKEN_ENCRYPTION_SECRET ??= "test-secret";

const state: ScanState = { v: 1, userId: "user-1", accountId: "acct-1", listed: 1000, pageToken: "p2", correspondents: ["a@b.com"], groups: {}, startedAt: Date.now() };

test("a scan cursor round-trips for its own user and account", () => {
  assert.deepEqual(decodeScanState(encodeScanState(state), "user-1", "acct-1"), state);
});

test("a scan cursor is rejected for another user or account, when tampered with, or when expired", () => {
  const token = encodeScanState(state);
  assert.equal(decodeScanState(token, "user-2", "acct-1"), null);
  assert.equal(decodeScanState(token, "user-1", "acct-2"), null);
  assert.equal(decodeScanState(`${token.slice(0, -2)}AA`, "user-1", "acct-1"), null);
  assert.equal(decodeScanState(encodeScanState({ ...state, startedAt: Date.now() - 21 * 60_000 }), "user-1", "acct-1"), null);
});
