import assert from "node:assert/strict";
import test from "node:test";
import { classifyError } from "./gmail.ts";

const apiError = (status: number, error: unknown) => ({ response: { status, data: { error } } });

test("Gmail rate limits are retried, not treated as lost access", () => {
  // Google reports per-user rate limits as 403 PERMISSION_DENIED.
  assert.equal(classifyError(apiError(403, { status: "PERMISSION_DENIED", errors: [{ reason: "userRateLimitExceeded" }] })), "retry");
  assert.equal(classifyError(apiError(403, { status: "PERMISSION_DENIED", errors: [{ reason: "rateLimitExceeded" }] })), "retry");
  assert.equal(classifyError(apiError(429, { status: "RESOURCE_EXHAUSTED", errors: [{ reason: "rateLimitExceeded" }] })), "retry");
  assert.equal(classifyError(apiError(503, { status: "UNAVAILABLE" })), "retry");
});

test("only a revoked grant or a missing Gmail scope counts as lost access", () => {
  assert.equal(classifyError(apiError(400, "invalid_grant")), "revoked");
  assert.equal(classifyError(apiError(401, { status: "UNAUTHENTICATED" })), "revoked");
  assert.equal(classifyError(apiError(403, { status: "PERMISSION_DENIED", errors: [{ reason: "insufficientPermissions" }] })), "revoked");
});

test("app misconfiguration does not disconnect the user", () => {
  assert.equal(classifyError(apiError(401, "invalid_client")), "other");
  assert.equal(classifyError(apiError(403, { status: "PERMISSION_DENIED", errors: [{ reason: "accessNotConfigured" }] })), "other");
});
