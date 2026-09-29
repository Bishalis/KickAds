import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { SenderAccumulators } from "./classifier.ts";
import { decryptSecret, encryptSecret } from "./google-oauth.ts";

/**
 * Progress of a multi-request scan. It travels to the browser between batches only as an
 * encrypted, compressed token, so nothing about the mailbox is stored server-side and the
 * browser can neither read nor alter it.
 */
export type ScanState = {
  v: 1;
  userId: string;
  accountId: string;
  pageToken?: string;
  listed: number;
  correspondents: string[];
  groups: SenderAccumulators;
  startedAt: number;
};

const maxScanAgeMs = 20 * 60_000;

export function encodeScanState(state: ScanState) {
  return encryptSecret(deflateRawSync(Buffer.from(JSON.stringify(state))).toString("base64"));
}

/** Returns null for tokens that are tampered with, expired, or belong to another user or account. */
export function decodeScanState(token: string, userId: string, accountId: string): ScanState | null {
  const decrypted = decryptSecret(token);
  if (!decrypted) return null;
  try {
    const state = JSON.parse(inflateRawSync(Buffer.from(decrypted, "base64")).toString("utf8")) as ScanState;
    const valid = state.v === 1 && state.userId === userId && state.accountId === accountId && Date.now() - state.startedAt < maxScanAgeMs;
    return valid ? state : null;
  } catch {
    return null;
  }
}
