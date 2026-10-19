import type { ScanContext, ScannedMessage } from "./classifier.ts";

// Shared test builders for Gmail messages as the scan sees them (headers and labels only).

export type HeaderList = Array<[string, string]>;

let nextId = 0;
export function message(options: { from: string; subject: string; headers?: HeaderList; labels?: string[]; daysAgo?: number; bodyUnsubscribeUrl?: string }): ScannedMessage {
  nextId += 1;
  return {
    id: `m${nextId}`,
    internalDate: Date.parse("2026-09-25T00:00:00Z") - (options.daysAgo ?? 0) * 86_400_000,
    labelIds: options.labels ?? [],
    bodyUnsubscribeUrl: options.bodyUnsubscribeUrl,
    headers: [["From", options.from], ["Subject", options.subject], ...(options.headers ?? [])].map(([name, value]) => ({ name, value })),
  };
}

/** Gmail's own authentication results for a sender that passes DMARC and DKIM. */
export function verified(domain: string, signsListHeaders = true): HeaderList {
  return [
    ["Authentication-Results", `mx.google.com; dkim=pass header.i=@${domain} header.s=s1; spf=pass smtp.mailfrom=${domain}; dmarc=pass (p=NONE) header.from=${domain}`],
    ["DKIM-Signature", `v=1; a=rsa-sha256; d=${domain}; s=s1; h=From:Subject:Date${signsListHeaders ? ":List-Unsubscribe:List-Unsubscribe-Post" : ""}; bh=x; b=y`],
  ];
}

export function oneClick(url: string): HeaderList {
  return [["List-Unsubscribe", `<${url}>, <mailto:unsub@example.com>`], ["List-Unsubscribe-Post", "List-Unsubscribe=One-Click"]];
}

export const newsletterHeaders: HeaderList = [...oneClick("https://news.example.com/u/abc"), ["List-ID", "Weekly <weekly.news.example.com>"], ...verified("news.example.com")];
export const emptyContext: ScanContext = { rules: [], correspondents: new Set() };
