import type { FakeMessage } from "./world.ts";

/**
 * Builders for fake Gmail messages, shared by the API tests (in-memory Gmail) and the
 * browser tests (fake Gmail server). Each returns what Gmail's API would report.
 */

let messageSeq = 0;
const dayMs = 86_400_000;

/** Gmail's own verification results for a sender that passes DMARC and DKIM. */
export function verifiedBy(domain: string, signsListHeaders = true): Array<[string, string]> {
  return [
    ["Authentication-Results", `mx.google.com; dkim=pass header.i=@${domain} header.s=s1; spf=pass; dmarc=pass (p=NONE) header.from=${domain}`],
    ["DKIM-Signature", `v=1; d=${domain}; s=s1; h=From:Subject:Date${signsListHeaders ? ":List-Unsubscribe:List-Unsubscribe-Post" : ""}; b=x`],
  ];
}

export function mail(from: string, subject: string, options: { daysAgo?: number; labels?: string[]; headers?: Array<[string, string]>; html?: string; to?: string } = {}): FakeMessage {
  messageSeq += 1;
  return {
    id: `msg-${messageSeq}`,
    from,
    to: options.to,
    subject,
    date: Date.now() - (options.daysAgo ?? 1) * dayMs - messageSeq * 1000,
    labels: options.labels ?? ["INBOX"],
    headers: options.headers,
    html: options.html,
  };
}

/** A verified newsletter. `method` decides how it can be unsubscribed from. */
export function newsletter(from: string, options: { daysAgo?: number; subject?: string; method?: "one_click" | "https" | "mailto" | "none"; listId?: string; verified?: boolean; labels?: string[] } = {}) {
  const address = from.match(/<([^>]+)>/)?.[1] ?? from;
  const domain = address.split("@")[1];
  const method = options.method ?? "one_click";
  const headers: Array<[string, string]> = [];
  if (method === "one_click" || method === "https") headers.push(["List-Unsubscribe", `<https://${domain}/unsubscribe/${encodeURIComponent(address)}>`]);
  if (method === "one_click") headers.push(["List-Unsubscribe-Post", "List-Unsubscribe=One-Click"]);
  if (method === "mailto") headers.push(["List-Unsubscribe", `<mailto:leave@${domain}?subject=unsubscribe>`]);
  if (options.listId !== undefined || method !== "none") headers.push(["List-ID", `<${options.listId ?? `news.${domain}`}>`]);
  if (options.verified !== false) headers.push(...verifiedBy(domain));
  return mail(from, options.subject ?? "This week's news", { daysAgo: options.daysAgo, labels: options.labels ?? ["INBOX", "CATEGORY_PROMOTIONS"], headers });
}

export function sentTo(address: string, options: { daysAgo?: number } = {}) {
  return mail("me@gmail.test", "Re: catching up", { to: address, labels: ["SENT"], daysAgo: options.daysAgo });
}

