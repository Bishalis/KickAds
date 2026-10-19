import { findRule, getExecutionMode, type Classification, type Confidence, type ExecutionMode, type SenderGroup, type SenderRule } from "./classifier.ts";
import type { UnsubscribeMethod } from "./unsubscribe.ts";

/** Current state of one sender. This is the source of truth for the Subscriptions page, not History. */
export type SubscriptionStatus = "active" | "unsubscribing" | "unsubscribed";

/** Which list a page asks for. Each maps to a database filter, so other rows are never sent. */
export type SubscriptionTab = "subscription" | "review" | "ignored" | "protected";

export const subscriptionTabs: SubscriptionTab[] = ["subscription", "review", "ignored", "protected"];

/** What the browser receives for one sender: no subjects, bodies, unsubscribe URLs, or message ids. */
export type SubscriptionView = {
  key: string;
  displayName: string;
  address: string;
  domain: string;
  listId: string | null;
  emailCount: number;
  lastReceivedAt: string;
  classification: Classification;
  confidence: Confidence;
  reasons: string[];
  unsubscribeMethod: UnsubscribeMethod;
  execution: ExecutionMode;
  protectedBy: SenderRule["matchType"] | null;
  ignored: boolean;
  status: SubscriptionStatus;
  unsubscribedAt: string | null;
  /** Email kept arriving more than two days after unsubscribing. */
  stillSending: boolean;
};

export type SubscriptionRow = {
  sender_key: string;
  display_name: string;
  address: string;
  domain: string;
  list_id: string | null;
  email_count: number;
  last_received_at: string;
  base_classification: Classification;
  confidence: Confidence;
  reasons: string[];
  unsubscribe_method: UnsubscribeMethod;
  execution: ExecutionMode;
  protected_by: SenderRule["matchType"] | null;
  ignored: boolean;
};

export type StoredSubscription = SubscriptionRow & {
  id: string;
  classification: Classification;
  status: SubscriptionStatus;
  unsubscribed_at: string | null;
};

/**
 * Builds the stored row for a sender. `baseGroup` is classified without the user's protect
 * rules, so removing a protection later restores the scan's own classification.
 */
export function toSubscriptionRow(baseGroup: SenderGroup, rules: SenderRule[]): SubscriptionRow {
  const protectRule = baseGroup.address ? findRule(rules, "protect", baseGroup.address, baseGroup.domain) : null;
  const ignoreRule = baseGroup.address ? findRule(rules, "ignore", baseGroup.address, baseGroup.domain) : null;
  return {
    sender_key: baseGroup.key,
    display_name: baseGroup.displayName.slice(0, 200),
    address: baseGroup.address,
    domain: baseGroup.domain,
    list_id: baseGroup.listId,
    email_count: baseGroup.emailCount,
    last_received_at: new Date(baseGroup.lastReceivedAt).toISOString(),
    base_classification: baseGroup.classification,
    confidence: baseGroup.confidence,
    reasons: baseGroup.reasons,
    unsubscribe_method: baseGroup.unsubscribe.method,
    execution: getExecutionMode(baseGroup),
    protected_by: protectRule?.matchType ?? null,
    ignored: Boolean(ignoreRule),
  };
}

const stillSendingGraceMs = 2 * 86_400_000;

export function toSubscriptionView(row: StoredSubscription): SubscriptionView {
  const isProtected = row.classification === "protected";
  return {
    key: row.sender_key,
    displayName: row.display_name,
    address: row.address,
    domain: row.domain,
    listId: row.list_id,
    emailCount: row.email_count,
    lastReceivedAt: row.last_received_at,
    classification: row.classification,
    confidence: isProtected && row.protected_by ? "high" : row.confidence,
    reasons: row.protected_by ? [`You protected this ${row.protected_by === "domain" ? "domain" : "sender"}`] : row.reasons,
    unsubscribeMethod: row.unsubscribe_method,
    // Protection always disables unsubscribing, whatever the scan found.
    execution: isProtected ? "none" : row.execution,
    protectedBy: row.protected_by,
    ignored: row.ignored && !isProtected,
    status: row.status,
    unsubscribedAt: row.unsubscribed_at,
    stillSending: row.status === "unsubscribed" && Boolean(row.unsubscribed_at)
      && Date.parse(row.last_received_at) > Date.parse(row.unsubscribed_at!) + stillSendingGraceMs,
  };
}

/** Database filter for each tab. Protected senders only ever come back for the "protected" tab. */
export function tabFilter(tab: SubscriptionTab): { classification: Classification | null; excludeProtected: boolean; ignored: boolean | null } {
  switch (tab) {
    case "subscription": return { classification: "subscription", excludeProtected: true, ignored: false };
    case "review": return { classification: "review", excludeProtected: true, ignored: false };
    case "ignored": return { classification: null, excludeProtected: true, ignored: true };
    case "protected": return { classification: "protected", excludeProtected: false, ignored: null };
  }
}

/** The sender's status after an unsubscribe attempt. Only a real success marks it unsubscribed. */
export function statusAfterAttempt(result: "success" | "failed" | "manual_required" | "no_method" | "blocked"): SubscriptionStatus {
  return result === "success" ? "unsubscribed" : "active";
}
