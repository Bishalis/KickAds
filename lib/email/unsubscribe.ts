import { isSameOrSubdomain, isValidEmailAddress } from "./sender.ts";

export type UnsubscribeMethod = "one_click" | "https" | "mailto" | "body_link" | "none";

export type UnsubscribeInfo = {
  method: UnsubscribeMethod;
  url?: string;
  mailto?: string;
};

export type Header = { name: string; value: string };

export type SenderAuthentication = {
  /** DMARC passed, or a passing DKIM signature is aligned with the From domain. */
  verified: boolean;
  /** A passing, aligned DKIM signature covers the List-Unsubscribe headers (RFC 8058 §4). */
  listHeadersSigned: boolean;
};

export function getHeader(headers: Header[], name: string) {
  const lower = name.toLowerCase();
  return headers.find((item) => item.name.toLowerCase() === lower)?.value.trim() ?? "";
}

function getHeaders(headers: Header[], name: string) {
  const lower = name.toLowerCase();
  return headers.filter((item) => item.name.toLowerCase() === lower).map((item) => item.value);
}

/**
 * Accepts only plain HTTPS URLs on the default port with a real hostname.
 * IP literals, credentials, and odd ports are never legitimate unsubscribe endpoints.
 */
export function parseUnsubscribeUrl(value: string): URL | null {
  if (value.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (url.port && url.port !== "443") return null;
  const host = url.hostname;
  if (!host.includes(".") || host.startsWith("[") || /^[\d.]+$/.test(host) || host.endsWith(".local") || host.endsWith(".internal")) return null;
  return url;
}

function parseMailto(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return undefined;
  }
  const address = decodeURIComponent(url.pathname).trim().toLowerCase();
  if (url.protocol !== "mailto:" || !isValidEmailAddress(address)) return undefined;
  const query = new URLSearchParams();
  const subject = url.searchParams.get("subject");
  const body = url.searchParams.get("body");
  if (subject) query.set("subject", subject.slice(0, 200));
  if (body) query.set("body", body.slice(0, 500));
  const suffix = query.toString();
  return `mailto:${address}${suffix ? `?${suffix.replace(/\+/g, "%20")}` : ""}`;
}

export function parseListUnsubscribe(headers: Header[]): UnsubscribeInfo {
  const entries = [...getHeader(headers, "List-Unsubscribe").matchAll(/<([^>]+)>/g)].map((match) => match[1].trim());
  const httpsUrl = entries.map(parseUnsubscribeUrl).find((url) => url !== null);
  if (httpsUrl) {
    const oneClick = /^\s*List-Unsubscribe\s*=\s*One-Click\s*$/i.test(getHeader(headers, "List-Unsubscribe-Post"));
    return { method: oneClick ? "one_click" : "https", url: httpsUrl.toString() };
  }
  const mailto = entries.map(parseMailto).find(Boolean);
  return mailto ? { method: "mailto", mailto } : { method: "none" };
}

const unsubscribeLabel = /\bunsubscribe\b|\bopt[\s-]?out\b|stop receiving|manage (?:your )?(?:email )?(?:preferences|subscriptions?)|email preferences/i;
const unsubscribePath = /unsubscribe|opt-?out/i;

function decodeHtmlEntities(value: string) {
  return value.replace(/&amp;/gi, "&").replace(/&#x2f;/gi, "/").replace(/&#47;/g, "/").replace(/&quot;/gi, '"');
}

/**
 * Finds an unsubscribe link in a message body. Only anchors whose visible text says
 * "unsubscribe"/"opt out", or whose URL path contains it, qualify; the first arbitrary
 * link in the body is never used.
 */
export function extractBodyUnsubscribeUrl(html: string, text: string): string | undefined {
  const anchors = [...html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({
    href: decodeHtmlEntities(match[2]),
    label: match[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
  }));
  const ranked = [
    ...anchors.filter((anchor) => unsubscribeLabel.test(anchor.label) && unsubscribePath.test(anchor.href)),
    ...anchors.filter((anchor) => unsubscribeLabel.test(anchor.label)),
    ...anchors.filter((anchor) => unsubscribePath.test(parseUnsubscribeUrl(anchor.href)?.pathname ?? "")),
  ];
  for (const anchor of ranked) {
    const url = parseUnsubscribeUrl(anchor.href);
    if (url) return url.toString();
  }
  for (const [candidate] of text.matchAll(/https:\/\/[^\s<>'"]+/gi)) {
    const url = parseUnsubscribeUrl(candidate.replace(/[),.;]+$/, ""));
    if (url && unsubscribePath.test(url.pathname)) return url.toString();
  }
  return undefined;
}

/**
 * Reads Gmail's own Authentication-Results header (authserv-id mx.google.com). Headers
 * from other hops are ignored because a sender can forge those.
 */
export function parseSenderAuthentication(headers: Header[], fromDomain: string): SenderAuthentication {
  const results = getHeaders(headers, "Authentication-Results").find((value) => /^\s*mx\.google\.com\s*;/i.test(value));
  if (!results || !fromDomain) return { verified: false, listHeadersSigned: false };

  const dmarcPass = [...results.matchAll(/\bdmarc=pass\b[^;]*?header\.from=([^\s;]+)/gi)]
    .some((match) => match[1].toLowerCase() === fromDomain);
  const alignedDkimDomains = [...results.matchAll(/\bdkim=pass\b[^;]*?header\.(?:i|d)=([^\s;]+)/gi)]
    .map((match) => match[1].toLowerCase().replace(/^.*@/, ""))
    .filter((domain) => isSameOrSubdomain(fromDomain, domain) || isSameOrSubdomain(domain, fromDomain));

  const listHeadersSigned = getHeaders(headers, "DKIM-Signature").some((signature) => {
    const tags = Object.fromEntries(signature.replace(/\s+/g, "").split(";").map((tag) => {
      const index = tag.indexOf("=");
      return [tag.slice(0, index).toLowerCase(), tag.slice(index + 1)];
    }));
    const domain = (tags.d ?? "").toLowerCase();
    const signed = (tags.h ?? "").toLowerCase().split(":");
    return alignedDkimDomains.includes(domain) && signed.includes("list-unsubscribe") && signed.includes("list-unsubscribe-post");
  });

  return { verified: dmarcPass || alignedDkimDomains.length > 0, listHeadersSigned };
}
