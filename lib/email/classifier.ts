import type { GmailMessage } from "@/lib/email/gmail.ts";

export type Classification = "subscription" | "protected" | "review";
export type SubscriptionCategory = "newsletter" | "digest" | "alert" | "marketing" | "unknown";
export type ClassificationConfidence = "high" | "medium" | "low";

export type NormalizedSender = {
  displayName: string;
  email: string;
  domain: string;
};

export type UnsubscribeInfo = {
  method: UnsubscribeMethod;
  url?: string;
  email?: string;
};

export type UnsubscribeMethod = "one_click" | "https" | "mailto" | "body_link" | "none";

export type ClassifiedEmail = GmailMessage & {
  sender: NormalizedSender;
  date: string;
  classification: Classification;
  category: SubscriptionCategory;
  confidence: ClassificationConfidence;
  isProtected: boolean;
  unsubscribeAvailable: boolean;
  unsubscribe?: UnsubscribeInfo;
};

export type SenderGroup = {
  key: string;
  displayName: string;
  senderEmail: string;
  domain: string;
  emails: ClassifiedEmail[];
  totalEmails: number;
  lastReceivedAt?: string;
  classification: Classification;
  isSubscription: boolean;
  isProtected: boolean;
  unsubscribeAvailable: boolean;
  unsubscribe?: UnsubscribeInfo;
  unsubscribeUrl?: string;
  oneClickUnsubscribe: boolean;
  classificationReason: string;
  subscriptions: Array<{
    key: string;
    category: SubscriptionCategory;
    emails: ClassifiedEmail[];
    totalEmails: number;
    unsubscribeAvailable: boolean;
    unsubscribe?: UnsubscribeInfo;
    confidence: ClassificationConfidence;
    classificationReason: string;
  }>;
  protectedEmails: ClassifiedEmail[];
  reviewEmails: ClassifiedEmail[];
};

const protectedRules: Array<[string, RegExp]> = [
  ["security or authentication", /password (?:was )?changed|new login|sign(?:ed)? in|verification code|verify your email|two[- ]?factor|2fa|authentication|suspicious activity/i],
  ["financial or payment", /bank statement|transaction (?:alert|confirmation)|payment (?:received|failed|processed)|invoice|receipt|refund|transfer (?:confirmation|failed)|withdrawal|deposit/i],
  ["order or delivery", /order (?:confirmation|has shipped|shipped)|purchase confirmation|shipping confirmation|shipment|delivery|tracking number/i],
  ["account or policy", /account (?:notification|update|suspended)|terms (?:of service|update)|privacy policy|membership (?:status|renewal)/i],
  ["education", /university|college|student|assignment|exam|enrol(?:l|l)ment|academic/i],
  ["employment", /job application|employment|interview|roster|shift|payroll|payslip/i],
  ["government or legal", /government|tax statement|ato|legal notice|court|official notice/i],
  ["health", /appointment confirmation|medical|health record|hospital|clinic|prescription/i],
];

const subscriptionWords = /newsletter|digest|weekly|monthly|daily|sale|deal|discount|offer|promotion|marketing|campaign|recommendations?|new products?/i;
const categoryRules: Array<[SubscriptionCategory, RegExp]> = [
  ["newsletter", /newsletter/i],
  ["digest", /digest|weekly|monthly|daily/i],
  ["alert", /alert|notification|breaking news/i],
  ["marketing", /sale|deal|discount|offer|promotion|marketing|campaign|recommendations?|new products?/i],
];

function header(message: GmailMessage, name: string) {
  return message.headers.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value?.trim() ?? "";
}

export function getMessageHeader(message: GmailMessage, name: string) {
  return header(message, name);
}

export function normalizeSender(value: string): NormalizedSender {
  const match = value.match(/^(.*?)\s*<([^>]+)>\s*$/);
  const email = (match?.[2] ?? value).trim().toLowerCase();
  const safeEmail = email.includes("@") ? email : "unknown@unknown.invalid";
  const displayName = (match?.[1] ?? safeEmail.split("@")[0]).replace(/^"|"$/g, "").trim() || "Unknown sender";
  return { displayName, email: safeEmail, domain: safeEmail.split("@")[1] ?? "unknown.invalid" };
}

function unsubscribeInfo(message: GmailMessage): UnsubscribeInfo {
  const listUnsubscribe = header(message, "List-Unsubscribe");
  const candidate = listUnsubscribe.match(/<([^>]+)>/i)?.[1];
  if (!candidate) return { method: "none" };
  if (candidate.toLowerCase().startsWith("mailto:")) {
    return { method: "mailto", email: candidate.slice("mailto:".length).split("?")[0] };
  }
  if (!isSafeOneClickUrl(candidate)) return { method: "none" };
  return {
    method: /list-unsubscribe\s*=\s*one-click/i.test(header(message, "List-Unsubscribe-Post")) ? "one_click" : "https",
    url: candidate,
  };
}

function classifyMessage(message: GmailMessage, sender: NormalizedSender): ClassifiedEmail {
  const subject = header(message, "Subject");
  // Sender addresses are not classification text: account@sender.com must not protect every message.
  const protectedMatch = protectedRules.find(([, rule]) => rule.test(subject));
  const unsubscribe = unsubscribeInfo(message);
  const category = categoryRules.find(([, rule]) => rule.test(subject))?.[0] ?? "unknown";
  const hasSubscriptionSignal = Boolean(unsubscribe.method !== "none" || subscriptionWords.test(subject));
  const classification: Classification = protectedMatch ? "protected" : hasSubscriptionSignal ? "subscription" : "review";
  const confidence: ClassificationConfidence = protectedMatch || unsubscribe.method === "one_click" ? "high" : hasSubscriptionSignal ? "medium" : "low";
  return {
    ...message,
    sender,
    date: header(message, "Date"),
    classification,
    category,
    confidence,
    isProtected: Boolean(protectedMatch),
    unsubscribeAvailable: unsubscribe.method !== "none",
    unsubscribe: unsubscribe.method !== "none" ? unsubscribe : undefined,
  };
}

export function classifySenderGroups(messages: GmailMessage[]): SenderGroup[] {
  const normalized = messages.map((message) => ({ message, sender: normalizeSender(header(message, "From")) }));
  const groups = new Map<string, SenderGroup>();
  for (const { message, sender } of normalized) {
    const email = classifyMessage(message, sender);
    const existing = groups.get(sender.email);
    if (existing) {
      existing.emails.push(email);
      existing.totalEmails += 1;
      if (!existing.lastReceivedAt || new Date(email.date).getTime() > new Date(existing.lastReceivedAt).getTime()) existing.lastReceivedAt = email.date;
      if (!existing.unsubscribeAvailable && email.unsubscribeAvailable) {
        existing.unsubscribeAvailable = true;
        existing.unsubscribe = email.unsubscribe;
        existing.unsubscribeUrl = email.unsubscribe?.url;
        existing.oneClickUnsubscribe = email.unsubscribe?.method === "one_click";
      }
      continue;
    }
    groups.set(sender.email, {
      key: sender.email,
      displayName: sender.displayName,
      senderEmail: sender.email,
      domain: sender.domain,
      emails: [email],
      totalEmails: 1,
      lastReceivedAt: email.date,
      classification: email.classification,
      isSubscription: email.classification === "subscription",
      isProtected: email.isProtected,
      unsubscribeAvailable: email.unsubscribeAvailable,
      unsubscribe: email.unsubscribe,
      unsubscribeUrl: email.unsubscribe?.url,
      oneClickUnsubscribe: email.unsubscribe?.method === "one_click",
      classificationReason: protectedRules.find(([, rule]) => rule.test(header(message, "Subject")))?.[0] ?? (email.classification === "subscription" ? "subscription signals found" : "not enough signals; review recommended"),
      subscriptions: [],
      protectedEmails: [],
      reviewEmails: [],
    });
  }

  for (const group of groups.values()) {
    group.protectedEmails = group.emails.filter((email) => email.classification === "protected");
    group.reviewEmails = group.emails.filter((email) => email.classification === "review");
    const subscriptions = new Map<string, SenderGroup["subscriptions"][number]>();
    for (const email of group.emails.filter((item) => item.classification === "subscription")) {
      const key = `${email.category}:${email.unsubscribe?.url ?? email.sender.email}`;
      const existing = subscriptions.get(key);
      if (existing) {
        existing.emails.push(email);
        existing.totalEmails += 1;
        existing.unsubscribeAvailable ||= email.unsubscribeAvailable;
        existing.unsubscribe ??= email.unsubscribe;
        if (email.confidence === "high") existing.confidence = "high";
      } else {
        subscriptions.set(key, {
          key,
          category: email.category,
          emails: [email],
          totalEmails: 1,
          unsubscribeAvailable: email.unsubscribeAvailable,
          unsubscribe: email.unsubscribe,
          confidence: email.confidence,
          classificationReason: email.unsubscribe?.method === "one_click" ? "RFC 8058 one-click header" : "subscription subject signals",
        });
      }
    }
    group.subscriptions = [...subscriptions.values()];
    group.classification = group.subscriptions.length ? "subscription" : group.protectedEmails.length ? "protected" : "review";
    group.isSubscription = group.subscriptions.length > 0;
    group.isProtected = group.protectedEmails.length > 0;
    // Protection belongs to the individual email/category, never the whole sender.
  }
  return [...groups.values()].sort((first, second) => second.totalEmails - first.totalEmails);
}

export function isSafeOneClickUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
