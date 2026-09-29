import { decodeEncodedWords, isPersonalMailboxDomain, isSameOrSubdomain, normalizeSender } from "./sender.ts";
import {
  getHeader,
  parseListUnsubscribe,
  parseSenderAuthentication,
  type Header,
  type SenderAuthentication,
  type UnsubscribeInfo,
  type UnsubscribeMethod,
} from "./unsubscribe.ts";

export type Classification = "subscription" | "protected" | "review";
export type Confidence = "high" | "medium" | "low";
/** How an unsubscribe would be carried out: sent by the server, opened by the user, or not possible. */
export type ExecutionMode = "automatic" | "manual" | "none";

/** Header-level view of one Gmail message. Bodies never leave the Gmail fetch layer. */
export type ScannedMessage = {
  id: string;
  internalDate: number;
  labelIds: string[];
  headers: Header[];
  bodyUnsubscribeUrl?: string;
};

export type SenderRule = {
  id: string;
  kind: "protect" | "ignore";
  matchType: "address" | "domain";
  value: string;
};

export type ScanContext = {
  rules: SenderRule[];
  /** Addresses the user has sent mail to. */
  correspondents: Set<string>;
};

export type SenderGroup = {
  key: string;
  displayName: string;
  address: string;
  domain: string;
  listId: string | null;
  messages: ScannedMessage[];
  lastReceivedAt: number;
  classification: Classification;
  confidence: Confidence;
  reasons: string[];
  protectRule: SenderRule | null;
  ignoreRule: SenderRule | null;
  unsubscribe: UnsubscribeInfo;
  authentication: SenderAuthentication;
};

/** What the browser receives: no bodies, no unsubscribe URLs, no message IDs. */
export type SenderSummary = {
  key: string;
  displayName: string;
  address: string;
  domain: string;
  listId: string | null;
  emailCount: number;
  lastReceivedAt: string;
  sampleSubjects: string[];
  classification: Classification;
  confidence: Confidence;
  reasons: string[];
  unsubscribeMethod: UnsubscribeMethod;
  execution: ExecutionMode;
  protectedBy: SenderRule["matchType"] | null;
  ignored: boolean;
};

export type ScanStats = {
  analyzed: number;
  senders: number;
  subscriptions: number;
  protected: number;
  review: number;
  ignored: number;
  capped: boolean;
};

// Subject patterns for messages people usually cannot afford to miss. These are one
// signal among several: they can only move a sender toward "protected" or "review",
// never toward "subscription".
const importantSubjectRules: Array<[string, RegExp]> = [
  ["security or sign-in", /password|sign[- ]?in|log[- ]?in|verification code|one[- ]time (?:code|pass)|passcode|\b2fa\b|two[- ]factor|security (?:alert|notice|code)|verify your|account (?:locked|suspended|recovery)/i],
  ["financial", /statement|payment|invoice|receipt|refund|transfer|withdrawal|deposit|direct debit|overdue|\bbill(?:ing)?\b|transaction|balance/i],
  ["order or delivery", /\border\b.*(?:confirm|shipped|dispatched|delivered|#\s?\d)|shipping|delivery|tracking|out for delivery/i],
  ["account or policy", /account (?:update|notification|change)|terms of (?:service|use)|privacy policy/i],
  ["education", /enrol(?:l)?ment|\bexam\b|assignment|\bgrades?\b|timetable|tuition|semester/i],
  ["employment", /interview|job application|offer letter|payslip|payroll|\broster\b|\bshift\b/i],
  ["government or legal", /\btax\b|\bATO\b|\bIRS\b|\bHMRC\b|\bcourt\b|legal notice|\bvisa\b|passport|\bcouncil\b/i],
  ["health", /appointment|prescription|test results|medical|clinic|hospital/i],
];

function ratio(messages: ScannedMessage[], label: string) {
  return messages.filter((message) => message.labelIds.includes(label)).length / messages.length;
}

function normalizeListId(value: string) {
  const id = (value.match(/<([^>]+)>/)?.[1] ?? value).trim().toLowerCase();
  return id ? id.slice(0, 255) : null;
}

export function getSubject(message: ScannedMessage) {
  return decodeEncodedWords(getHeader(message.headers, "Subject"));
}

export function findRule(rules: SenderRule[], kind: SenderRule["kind"], address: string, domain: string) {
  return rules.find((rule) => rule.kind === kind && (
    rule.matchType === "address" ? rule.value === address : Boolean(domain) && isSameOrSubdomain(domain, rule.value)
  )) ?? null;
}

function decide(group: Omit<SenderGroup, "classification" | "confidence" | "reasons">, context: ScanContext): Pick<SenderGroup, "classification" | "confidence" | "reasons"> {
  const { messages, address, domain, listId, unsubscribe, authentication } = group;

  // 1. The user's own decision always wins.
  if (group.protectRule) {
    return { classification: "protected", confidence: "high", reasons: [`You protected this ${group.protectRule.matchType === "domain" ? "domain" : "sender"}`] };
  }
  if (!address) {
    return { classification: "review", confidence: "low", reasons: ["The sender address could not be read"] };
  }

  // 2. Evidence that this sender matters to the user.
  const importantEvidence: string[] = [];
  if (context.correspondents.has(address)) importantEvidence.push("You have sent email to this address");
  if (messages.some((message) => message.labelIds.includes("STARRED"))) importantEvidence.push("You starred email from this sender");
  if (isPersonalMailboxDomain(domain)) importantEvidence.push("Sent from a personal mailbox, not a mailing service");
  const importantTopics = new Set(messages.flatMap((message) => {
    const subject = getSubject(message);
    return importantSubjectRules.filter(([, pattern]) => pattern.test(subject)).map(([topic]) => topic);
  }));
  if (importantTopics.size) importantEvidence.push(`Some subjects look like ${[...importantTopics].join(", ")} messages`);

  // 3. Structural evidence of a mailing list, independent of wording.
  const listHeaderCount = messages.filter((message) => parseListUnsubscribe(message.headers).method !== "none").length;
  const bulk = messages.some((message) => /^(bulk|list)$/i.test(getHeader(message.headers, "Precedence")));
  const promotions = ratio(messages, "CATEGORY_PROMOTIONS");
  const subscriptionEvidence: string[] = [];
  if (listHeaderCount) subscriptionEvidence.push("Has a List-Unsubscribe header");
  if (listId) subscriptionEvidence.push("Sent through a mailing list (List-ID)");
  if (bulk) subscriptionEvidence.push("Marked as bulk mail");
  if (promotions >= 0.5) subscriptionEvidence.push("Gmail files it under Promotions");

  if (importantEvidence.length) {
    return subscriptionEvidence.length
      ? { classification: "review", confidence: "low", reasons: [...importantEvidence, `Also looks like a mailing list: ${subscriptionEvidence.join("; ").toLowerCase()}`] }
      : { classification: "protected", confidence: "medium", reasons: importantEvidence };
  }
  if (!subscriptionEvidence.length) {
    return { classification: "review", confidence: "low", reasons: [unsubscribe.method === "body_link" ? "Only an unsubscribe link in the email body; no mailing-list headers" : "No mailing-list signals found"] };
  }

  // 4. Looks like a list. Stay conservative about who sent it and what kind of mail it is.
  if (listHeaderCount && !authentication.verified) {
    return { classification: "review", confidence: "low", reasons: [...subscriptionEvidence, "Gmail could not verify the sender (DKIM/DMARC), so the unsubscribe link may not be genuine"] };
  }
  const updates = ratio(messages, "CATEGORY_UPDATES");
  if (updates >= 0.5 && promotions < 0.5 && !listId && !bulk) {
    return { classification: "review", confidence: "low", reasons: [...subscriptionEvidence, "Gmail files it under Updates, which is typical for account and service notifications"] };
  }
  if (ratio(messages, "IMPORTANT") >= 0.5 && promotions < 0.5) {
    return { classification: "review", confidence: "low", reasons: [...subscriptionEvidence, "Gmail marks most of these emails as important"] };
  }

  const strong = listHeaderCount > 0 && authentication.verified && (Boolean(listId) || bulk || promotions >= 0.5) && messages.length >= 2;
  return { classification: "subscription", confidence: strong ? "high" : "medium", reasons: subscriptionEvidence };
}

function groupKey(address: string, listId: string | null, displayName: string) {
  return address ? `${address}|${listId ?? ""}` : `unknown|${displayName.toLowerCase()}`;
}

/**
 * Groups messages by sender address plus List-ID, so different lists from one address
 * stay separate and a list never absorbs transactional mail sent without a List-ID.
 */
export function buildSenderGroups(messages: ScannedMessage[], context: ScanContext): SenderGroup[] {
  const buckets = new Map<string, { displayName: string; address: string; domain: string; listId: string | null; messages: ScannedMessage[] }>();
  for (const message of messages) {
    const sender = normalizeSender(getHeader(message.headers, "From"));
    const listId = normalizeListId(getHeader(message.headers, "List-ID"));
    const key = groupKey(sender.email, listId, sender.displayName);
    const bucket = buckets.get(key) ?? { displayName: sender.displayName, address: sender.email, domain: sender.domain, listId, messages: [] };
    bucket.messages.push(message);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()].map(([key, bucket]) => {
    const sorted = bucket.messages.toSorted((a, b) => b.internalDate - a.internalDate);
    // The newest message carries the most current unsubscribe endpoint.
    const headerTarget = sorted.find((message) => parseListUnsubscribe(message.headers).method !== "none");
    const bodyTarget = sorted.find((message) => message.bodyUnsubscribeUrl);
    const unsubscribe: UnsubscribeInfo = headerTarget
      ? parseListUnsubscribe(headerTarget.headers)
      : bodyTarget ? { method: "body_link", url: bodyTarget.bodyUnsubscribeUrl } : { method: "none" };
    const partial = {
      key,
      displayName: normalizeSender(getHeader(sorted[0].headers, "From")).displayName || bucket.displayName,
      address: bucket.address,
      domain: bucket.domain,
      listId: bucket.listId,
      messages: sorted,
      lastReceivedAt: sorted[0].internalDate,
      protectRule: bucket.address ? findRule(context.rules, "protect", bucket.address, bucket.domain) : null,
      ignoreRule: bucket.address ? findRule(context.rules, "ignore", bucket.address, bucket.domain) : null,
      unsubscribe,
      authentication: parseSenderAuthentication((headerTarget ?? sorted[0]).headers, bucket.domain),
    };
    return { ...partial, ...decide(partial, context) };
  }).sort((a, b) => b.messages.length - a.messages.length);
}

export type UnsubscribeDecision =
  | { outcome: "blocked"; reason: string }
  | { outcome: "no_method" }
  | { outcome: "automatic"; url: string }
  | { outcome: "manual"; method: UnsubscribeMethod; url?: string; mailto?: string };

/**
 * The only gate between a classification and an unsubscribe action. The server sends a
 * request itself only for an RFC 8058 one-click endpoint on a verified, DKIM-signed
 * subscription; everything else is handed back to the user to open themselves.
 */
export function evaluateUnsubscribe(group: SenderGroup, options: { confirmed: boolean; acknowledgeReview: boolean }): UnsubscribeDecision {
  if (!options.confirmed) return { outcome: "blocked", reason: "Explicit confirmation is required." };
  if (group.classification === "protected") return { outcome: "blocked", reason: "This sender is protected. Remove the protection first if you really want to unsubscribe." };
  if (group.classification === "review" && !options.acknowledgeReview) return { outcome: "blocked", reason: "This sender needs review. Confirm that you have reviewed it first." };
  if (!group.address) return { outcome: "blocked", reason: "The sender address could not be read." };

  const { method, url, mailto } = group.unsubscribe;
  if (method === "none") return { outcome: "no_method" };
  if (method === "one_click" && url && group.classification === "subscription" && group.authentication.verified && group.authentication.listHeadersSigned) {
    return { outcome: "automatic", url };
  }
  return { outcome: "manual", method, url, mailto };
}

export function getExecutionMode(group: SenderGroup): ExecutionMode {
  if (group.classification === "protected" || group.unsubscribe.method === "none" || !group.address) return "none";
  const decision = evaluateUnsubscribe(group, { confirmed: true, acknowledgeReview: true });
  return decision.outcome === "automatic" ? "automatic" : decision.outcome === "manual" ? "manual" : "none";
}

export function toSenderSummary(group: SenderGroup): SenderSummary {
  return {
    key: group.key,
    displayName: group.displayName,
    address: group.address,
    domain: group.domain,
    listId: group.listId,
    emailCount: group.messages.length,
    lastReceivedAt: new Date(group.lastReceivedAt).toISOString(),
    sampleSubjects: group.messages.slice(0, 3).map((message) => getSubject(message).slice(0, 140) || "(No subject)"),
    classification: group.classification,
    confidence: group.confidence,
    reasons: group.reasons,
    unsubscribeMethod: group.unsubscribe.method,
    execution: getExecutionMode(group),
    protectedBy: group.protectRule?.matchType ?? null,
    ignored: Boolean(group.ignoreRule) && !group.protectRule,
  };
}

export function getScanStats(groups: SenderGroup[], capped: boolean): ScanStats {
  const visible = groups.filter((group) => !group.ignoreRule || group.protectRule);
  return {
    analyzed: groups.reduce((total, group) => total + group.messages.length, 0),
    senders: groups.length,
    subscriptions: visible.filter((group) => group.classification === "subscription").length,
    protected: visible.filter((group) => group.classification === "protected").length,
    review: visible.filter((group) => group.classification === "review").length,
    ignored: groups.length - visible.length,
    capped,
  };
}
