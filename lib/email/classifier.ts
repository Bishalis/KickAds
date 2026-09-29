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

/**
 * Running totals for one sender. Scans fold messages into these batch by batch, so a
 * large mailbox never has to be held in memory, and only what classification needs is
 * kept (no message bodies, and only the 3 newest subjects).
 */
export type SenderAccumulator = {
  key: string;
  displayName: string;
  address: string;
  domain: string;
  listId: string | null;
  emailCount: number;
  lastReceivedAt: number;
  newestMessageId: string;
  listHeaderCount: number;
  bulk: boolean;
  promotions: number;
  updates: number;
  important: number;
  starred: boolean;
  importantTopics: string[];
  recentSubjects: Array<{ subject: string; date: number }>;
  /** Unsubscribe details from the newest message that carried a List-Unsubscribe header. */
  headerTarget: { date: number; unsubscribe: UnsubscribeInfo; authentication: SenderAuthentication } | null;
  bodyTarget: { date: number; url: string } | null;
};

export type SenderAccumulators = Record<string, SenderAccumulator>;

export type SenderGroup = {
  key: string;
  displayName: string;
  address: string;
  domain: string;
  listId: string | null;
  emailCount: number;
  lastReceivedAt: number;
  newestMessageId: string;
  sampleSubjects: string[];
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

function groupKey(address: string, listId: string | null, displayName: string) {
  return address ? `${address}|${listId ?? ""}` : `unknown|${displayName.toLowerCase()}`;
}

/**
 * Adds messages to per-sender totals, grouped by sender address plus List-ID so different
 * lists from one address stay separate and a list never absorbs transactional mail sent
 * without a List-ID. Mutates and returns `groups`.
 */
export function foldMessages(groups: SenderAccumulators, messages: ScannedMessage[]): SenderAccumulators {
  for (const message of messages) {
    const sender = normalizeSender(getHeader(message.headers, "From"));
    const listId = normalizeListId(getHeader(message.headers, "List-ID"));
    const key = groupKey(sender.email, listId, sender.displayName);
    const group = groups[key] ??= {
      key,
      displayName: sender.displayName,
      address: sender.email,
      domain: sender.domain,
      listId,
      emailCount: 0,
      lastReceivedAt: 0,
      newestMessageId: message.id,
      listHeaderCount: 0,
      bulk: false,
      promotions: 0,
      updates: 0,
      important: 0,
      starred: false,
      importantTopics: [],
      recentSubjects: [],
      headerTarget: null,
      bodyTarget: null,
    };
    const date = message.internalDate;
    const subject = getSubject(message);
    const labels = message.labelIds;

    group.emailCount += 1;
    if (date >= group.lastReceivedAt) {
      group.lastReceivedAt = date;
      group.newestMessageId = message.id;
      group.displayName = sender.displayName || group.displayName;
    }
    if (/^(bulk|list)$/i.test(getHeader(message.headers, "Precedence"))) group.bulk = true;
    if (labels.includes("CATEGORY_PROMOTIONS")) group.promotions += 1;
    if (labels.includes("CATEGORY_UPDATES")) group.updates += 1;
    if (labels.includes("IMPORTANT")) group.important += 1;
    if (labels.includes("STARRED")) group.starred = true;
    for (const [topic, pattern] of importantSubjectRules) {
      if (pattern.test(subject) && !group.importantTopics.includes(topic)) group.importantTopics.push(topic);
    }
    group.recentSubjects = [...group.recentSubjects, { subject: subject.slice(0, 140), date }]
      .sort((a, b) => b.date - a.date)
      .slice(0, 3);

    // The newest message carries the most current unsubscribe endpoint.
    const unsubscribe = parseListUnsubscribe(message.headers);
    if (unsubscribe.method !== "none") {
      group.listHeaderCount += 1;
      if (!group.headerTarget || date > group.headerTarget.date) {
        group.headerTarget = { date, unsubscribe, authentication: parseSenderAuthentication(message.headers, sender.domain) };
      }
    }
    if (message.bodyUnsubscribeUrl && (!group.bodyTarget || date > group.bodyTarget.date)) {
      group.bodyTarget = { date, url: message.bodyUnsubscribeUrl };
    }
  }
  return groups;
}

function decide(group: SenderAccumulator, protectRule: SenderRule | null, unsubscribe: UnsubscribeInfo, authentication: SenderAuthentication, context: ScanContext): Pick<SenderGroup, "classification" | "confidence" | "reasons"> {
  const { address, domain, listId, emailCount, listHeaderCount, bulk } = group;
  const ratio = (count: number) => count / emailCount;

  // 1. The user's own decision always wins.
  if (protectRule) {
    return { classification: "protected", confidence: "high", reasons: [`You protected this ${protectRule.matchType === "domain" ? "domain" : "sender"}`] };
  }
  if (!address) {
    return { classification: "review", confidence: "low", reasons: ["The sender address could not be read"] };
  }

  // 2. Evidence that this sender matters to the user.
  const importantEvidence: string[] = [];
  if (context.correspondents.has(address)) importantEvidence.push("You have sent email to this address");
  if (group.starred) importantEvidence.push("You starred email from this sender");
  if (isPersonalMailboxDomain(domain)) importantEvidence.push("Sent from a personal mailbox, not a mailing service");
  if (group.importantTopics.length) importantEvidence.push(`Some subjects look like ${group.importantTopics.join(", ")} messages`);

  // 3. Structural evidence of a mailing list, independent of wording.
  const promotions = ratio(group.promotions);
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
  if (ratio(group.updates) >= 0.5 && promotions < 0.5 && !listId && !bulk) {
    return { classification: "review", confidence: "low", reasons: [...subscriptionEvidence, "Gmail files it under Updates, which is typical for account and service notifications"] };
  }
  if (ratio(group.important) >= 0.5 && promotions < 0.5) {
    return { classification: "review", confidence: "low", reasons: [...subscriptionEvidence, "Gmail marks most of these emails as important"] };
  }

  const strong = listHeaderCount > 0 && authentication.verified && (Boolean(listId) || bulk || promotions >= 0.5) && emailCount >= 2;
  return { classification: "subscription", confidence: strong ? "high" : "medium", reasons: subscriptionEvidence };
}

const unverified: SenderAuthentication = { verified: false, listHeadersSigned: false };

export function finalizeGroups(groups: SenderAccumulators, context: ScanContext): SenderGroup[] {
  return Object.values(groups).map((group) => {
    const unsubscribe: UnsubscribeInfo = group.headerTarget?.unsubscribe
      ?? (group.bodyTarget ? { method: "body_link", url: group.bodyTarget.url } : { method: "none" });
    const authentication = group.headerTarget?.authentication ?? unverified;
    const protectRule = group.address ? findRule(context.rules, "protect", group.address, group.domain) : null;
    return {
      key: group.key,
      displayName: group.displayName,
      address: group.address,
      domain: group.domain,
      listId: group.listId,
      emailCount: group.emailCount,
      lastReceivedAt: group.lastReceivedAt,
      newestMessageId: group.newestMessageId,
      sampleSubjects: group.recentSubjects.map((item) => item.subject || "(No subject)"),
      protectRule,
      ignoreRule: group.address ? findRule(context.rules, "ignore", group.address, group.domain) : null,
      unsubscribe,
      authentication,
      ...decide(group, protectRule, unsubscribe, authentication, context),
    };
  }).sort((a, b) => b.emailCount - a.emailCount);
}

export function buildSenderGroups(messages: ScannedMessage[], context: ScanContext): SenderGroup[] {
  return finalizeGroups(foldMessages({}, messages), context);
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
    emailCount: group.emailCount,
    lastReceivedAt: new Date(group.lastReceivedAt).toISOString(),
    sampleSubjects: group.sampleSubjects,
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
    analyzed: groups.reduce((total, group) => total + group.emailCount, 0),
    senders: groups.length,
    subscriptions: visible.filter((group) => group.classification === "subscription").length,
    protected: visible.filter((group) => group.classification === "protected").length,
    review: visible.filter((group) => group.classification === "review").length,
    ignored: groups.length - visible.length,
    capped,
  };
}
