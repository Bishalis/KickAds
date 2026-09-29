import type { ScanStats, SenderRule, SenderSummary } from "@/lib/email/classifier";
import type { GmailAccount, UnsubscribeStatus } from "@/lib/email/store";
import type { Plan } from "@/lib/plans";

export type CachedSender = SenderSummary & { lastAction: { id: string; status: UnsubscribeStatus; createdAt: string } | null };
export type UnsubscribeResult = { status: UnsubscribeStatus; detail: string; manualUrl?: string; mailto?: string; upgrade?: boolean };

export type AccountScan = {
  senders: CachedSender[];
  rules: SenderRule[];
  stats: ScanStats | null;
  results: Record<string, UnsubscribeResult>;
};

export type WorkspaceSnapshot = {
  plan: Plan;
  accounts: GmailAccount[];
  selectedAccountId: string | null;
  scans: Record<string, AccountScan>;
};

// Held in memory only: it survives navigating between pages but not a page refresh,
// and nothing about the inbox is written to browser storage.
let snapshot: WorkspaceSnapshot | null = null;

export function getScanSnapshot() {
  return snapshot;
}

export function setScanSnapshot(next: WorkspaceSnapshot) {
  snapshot = next;
}

/** Call whenever the Gmail accounts or signed-in user change. */
export function clearScanSnapshot() {
  snapshot = null;
}
