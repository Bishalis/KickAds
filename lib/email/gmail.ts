import { google, type gmail_v1 } from "googleapis";
import type { ScannedMessage } from "./classifier.ts";
import { createAuthorizedClient } from "./google-oauth.ts";
import { normalizeSender } from "./sender.ts";
import { extractBodyUnsubscribeUrl, getHeader, parseListUnsubscribe } from "./unsubscribe.ts";

type Gmail = gmail_v1.Gmail;

// A sender silent for this long has most likely stopped mailing, or was already
// unsubscribed, so it isn't worth showing. Scanning this window drops exactly those senders.
const activeSenderWindowMonths = 6;
const scanQuery = `newer_than:${activeSenderWindowMonths}m -in:sent -in:chats -in:drafts`;
const maxSentMessages = 200;
/** Senders without an unsubscribe header whose newest email body is checked for a link. */
export const maxBodyLookups = 40;
/** Emails analyzed per scan request; keeps each request well under the 60s time limit. */
export const scanBatchSize = 1000;
const concurrency = 8;
// Gmail allows 250 quota units per user per second and list/get cost 5 units each (50/s).
// Starting at most one request every 25ms (40/s) stays under that with headroom.
const minRequestIntervalMs = 25;
const metadataHeaders = [
  "From", "Subject", "Date", "List-Unsubscribe", "List-Unsubscribe-Post", "List-ID",
  "Precedence", "Authentication-Results", "DKIM-Signature",
];

/** The Google grant was revoked, expired, or lacks the Gmail scope; the user must reconnect. */
export class GmailAccessError extends Error {}

type GoogleApiError = {
  status?: number;
  code?: number | string;
  response?: { status?: number; data?: { error?: string | { status?: string; errors?: Array<{ reason?: string }> } } };
};

function inspectError(error: unknown) {
  const candidate = error as GoogleApiError;
  const status = candidate.response?.status ?? candidate.status ?? (typeof candidate.code === "number" ? candidate.code : undefined);
  const data = candidate.response?.data?.error;
  const code = typeof data === "string" ? data : data?.status ?? "";
  const reasons = typeof data === "object" ? (data.errors ?? []).map((item) => item.reason ?? "") : [];
  return { status, code, reasons };
}

/**
 * Google reports rate limits as 403 PERMISSION_DENIED too, so the reason must be checked
 * before a 403 can be read as lost access. Misconfigured client credentials are an app
 * problem, not the user's, and must not disconnect them.
 */
export function classifyError(error: unknown): "revoked" | "retry" | "other" {
  const { status, code, reasons } = inspectError(error);
  if (status === 429 || (status !== undefined && status >= 500)) return "retry";
  if (reasons.some((reason) => /rateLimitExceeded|quotaExceeded|concurrentLimitExceeded|backendError/i.test(reason))) return "retry";
  if (code === "invalid_client" || code === "unauthorized_client") return "other";
  if (code === "invalid_grant" || status === 401) return "revoked";
  if (status === 403 && reasons.includes("insufficientPermissions")) return "revoked";
  return "other";
}

function describeError(error: unknown) {
  const { status, code, reasons } = inspectError(error);
  return `status=${status ?? "none"} code=${code || "none"} reasons=${reasons.join(",") || "none"}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// One pacer per Gmail client, shared by every request a scan makes in parallel.
const pacers = new WeakMap<Gmail, { nextStart: number }>();

async function pace(gmail: Gmail) {
  const pacer = pacers.get(gmail) ?? { nextStart: 0 };
  pacers.set(gmail, pacer);
  const now = Date.now();
  const start = Math.max(now, pacer.nextStart);
  pacer.nextStart = start + minRequestIntervalMs;
  if (start > now) await sleep(start - now);
}

async function call<T>(gmail: Gmail, operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    await pace(gmail);
    try {
      return await operation();
    } catch (error) {
      const kind = classifyError(error);
      if (kind === "revoked") {
        console.error("[gmail api] access lost:", describeError(error));
        throw new GmailAccessError("Gmail access was revoked or has expired.");
      }
      if (kind !== "retry" || attempt >= 4) {
        console.error("[gmail api] request failed:", describeError(error));
        throw error;
      }
      await sleep(1000 * 2 ** (attempt - 1) + Math.random() * 500);
    }
  }
}

async function mapConcurrent<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

export function createGmailClient(refreshToken: string): Gmail {
  return google.gmail({ version: "v1", auth: createAuthorizedClient(refreshToken) });
}

async function listMessageIds(gmail: Gmail, q: string, limit: number, startPageToken?: string) {
  const ids: string[] = [];
  let pageToken = startPageToken;
  do {
    const { data } = await call(gmail, () => gmail.users.messages.list({ userId: "me", q, pageToken, maxResults: Math.min(500, limit - ids.length) }));
    ids.push(...(data.messages ?? []).flatMap((message) => (message.id ? [message.id] : [])));
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken && ids.length < limit);
  return { ids, nextPageToken: pageToken };
}

async function getMetadata(gmail: Gmail, id: string, headers: string[]): Promise<ScannedMessage | null> {
  const { data } = await call(gmail, () => gmail.users.messages.get({ userId: "me", id, format: "metadata", metadataHeaders: headers }));
  if (!data.id) return null;
  return {
    id: data.id,
    internalDate: Number(data.internalDate ?? 0),
    labelIds: data.labelIds ?? [],
    headers: (data.payload?.headers ?? []).flatMap((header) => (header.name && header.value ? [{ name: header.name, value: header.value }] : [])),
  };
}

function decodePart(part: gmail_v1.Schema$MessagePart) {
  if (!part.body?.data) return "";
  const charset = getHeader((part.headers ?? []).map((header) => ({ name: header.name ?? "", value: header.value ?? "" })), "Content-Type")
    .match(/charset="?([^";\s]+)/i)?.[1] ?? "utf-8";
  const bytes = Buffer.from(part.body.data, "base64url");
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return bytes.toString("utf8");
  }
}

function collectBodies(part: gmail_v1.Schema$MessagePart | undefined, bodies = { html: "", text: "" }) {
  if (!part || part.filename) return bodies;
  if (part.mimeType === "text/html" && !bodies.html) bodies.html = decodePart(part);
  if (part.mimeType === "text/plain" && !bodies.text) bodies.text = decodePart(part);
  for (const child of part.parts ?? []) collectBodies(child, bodies);
  return bodies;
}

/** Reads one message body only to find an unsubscribe link; the body itself is discarded. */
async function findBodyUnsubscribeUrl(gmail: Gmail, id: string) {
  const { data } = await call(gmail, () => gmail.users.messages.get({ userId: "me", id, format: "full" }));
  const bodies = collectBodies(data.payload);
  return extractBodyUnsubscribeUrl(bodies.html, bodies.text);
}

/**
 * For senders without a List-Unsubscribe header, look for a body link in their newest
 * message only, so bodies are fetched for a small, bounded set of messages.
 */
async function addBodyUnsubscribeLinks(gmail: Gmail, messages: ScannedMessage[]) {
  const newestBySender = new Map<string, ScannedMessage>();
  const hasHeader = new Set<string>();
  for (const message of messages) {
    const address = normalizeSender(getHeader(message.headers, "From")).email;
    if (!address) continue;
    if (parseListUnsubscribe(message.headers).method !== "none") hasHeader.add(address);
    const newest = newestBySender.get(address);
    if (!newest || message.internalDate > newest.internalDate) newestBySender.set(address, message);
  }
  const targets = [...newestBySender.entries()].filter(([address]) => !hasHeader.has(address)).slice(0, maxBodyLookups).map(([, message]) => message);
  await mapConcurrent(targets, async (message) => {
    message.bodyUnsubscribeUrl = await findBodyUnsubscribeUrl(gmail, message.id).catch((error) => {
      if (error instanceof GmailAccessError) throw error;
      return undefined;
    });
  });
}

async function getMetadataBatch(gmail: Gmail, ids: string[], headers: string[]) {
  const results = await mapConcurrent(ids, (id) => getMetadata(gmail, id, headers).catch((error) => {
    if (error instanceof GmailAccessError) throw error;
    return null;
  }));
  return results.filter((message): message is ScannedMessage => message !== null);
}

/**
 * One batch of received mail from active senders (last 6 months, excluding Sent/Chats/
 * Drafts), headers only. Pass the returned page token to continue with the next batch.
 */
export async function scanMailboxBatch(gmail: Gmail, limit: number, pageToken?: string) {
  const { ids, nextPageToken } = await listMessageIds(gmail, scanQuery, limit, pageToken);
  return { messages: await getMetadataBatch(gmail, ids, metadataHeaders), listed: ids.length, nextPageToken };
}

/** Looks for body unsubscribe links in the given messages; bodies are discarded right away. */
export async function findBodyUnsubscribeUrls(gmail: Gmail, messageIds: string[]) {
  const urls = new Map<string, string>();
  await mapConcurrent(messageIds.slice(0, maxBodyLookups), async (id) => {
    const url = await findBodyUnsubscribeUrl(gmail, id).catch((error) => {
      if (error instanceof GmailAccessError) throw error;
      return undefined;
    });
    if (url) urls.set(id, url);
  });
  return urls;
}

/** Addresses the user recently wrote to; a strong sign a sender matters. */
export async function getRecentCorrespondents(gmail: Gmail) {
  const { ids } = await listMessageIds(gmail, "in:sent newer_than:1y", maxSentMessages);
  const sent = await getMetadataBatch(gmail, ids, ["To", "Cc", "Bcc"]);
  const addresses = new Set<string>();
  for (const message of sent) {
    for (const header of message.headers) {
      for (const [address] of header.value.matchAll(/[^\s<>,;:"()]+@[^\s<>,;:"()]+/g)) addresses.add(address.toLowerCase());
    }
  }
  return addresses;
}

/** Fresh view of one sender, used to re-check eligibility right before unsubscribing. */
export async function scanSender(gmail: Gmail, address: string) {
  const [{ ids }, sent] = await Promise.all([
    listMessageIds(gmail, `from:"${address}" ${scanQuery}`, 100),
    call(gmail, () => gmail.users.messages.list({ userId: "me", q: `in:sent to:"${address}"`, maxResults: 1 })),
  ]);
  const messages = await getMetadataBatch(gmail, ids, metadataHeaders);
  await addBodyUnsubscribeLinks(gmail, messages);
  const correspondents = new Set<string>(sent.data.messages?.length ? [address] : []);
  return { messages, correspondents };
}

export async function getGmailProfileEmail(gmail: Gmail) {
  const { data } = await call(gmail, () => gmail.users.getProfile({ userId: "me" }));
  return data.emailAddress?.toLowerCase() ?? null;
}
