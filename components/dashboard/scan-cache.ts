import type { ScanStats, SenderRule, SenderSummary } from "@/lib/email/classifier";
import type { UnsubscribeStatus } from "@/lib/email/store";

export type CachedSender = SenderSummary & { lastAction: { id: string; status: UnsubscribeStatus; createdAt: string } | null };
export type UnsubscribeResult = { status: UnsubscribeStatus; detail: string; manualUrl?: string; mailto?: string };

export type ScanSnapshot = {
  gmailEmail: string;
  senders: CachedSender[];
  rules: SenderRule[];
  stats: ScanStats | null;
  results: Record<string, UnsubscribeResult>;
};

// Held in memory only: it survives navigating between pages but not a page refresh,
// and nothing about the inbox is written to browser storage.
let snapshot: ScanSnapshot | null = null;

export function getScanSnapshot() {
  return snapshot;
}

export function setScanSnapshot(next: ScanSnapshot) {
  snapshot = next;
}

/** Call whenever the Gmail account or signed-in user changes. */
export function clearScanSnapshot() {
  snapshot = null;
}
