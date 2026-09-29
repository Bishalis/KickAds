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
const maxScanMessages = 1500;
const maxSentMessages = 200;
const maxBodyLookups = 40;
const concurrency = 20;
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

function isAccessError(error: unknown) {
  const { status, code, reasons } = inspectError(error);
  return status === 401
    || ["invalid_grant", "unauthorized_client", "invalid_client"].includes(code)
    || (status === 403 && (code === "PERMISSION_DENIED" || reasons.includes("insufficientPermissions")));
}

function isRetryable(error: unknown) {
  const { status, reasons } = inspectError(error);
  return status === 429 || (status !== undefined && status >= 500)
    || (status === 403 && reasons.some((reason) => /rateLimitExceeded/i.test(reason)));
}

async function call<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (isAccessError(error)) throw new GmailAccessError("Gmail access was revoked or has expired.");
      if (attempt >= 3 || !isRetryable(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
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

async function listMessageIds(gmail: Gmail, q: string, limit: number) {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const { data } = await call(() => gmail.users.messages.list({ userId: "me", q, pageToken, maxResults: Math.min(500, limit - ids.length) }));
    ids.push(...(data.messages ?? []).flatMap((message) => (message.id ? [message.id] : [])));
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken && ids.length < limit);
  return { ids, capped: Boolean(pageToken) };
}

async function getMetadata(gmail: Gmail, id: string, headers: string[]): Promise<ScannedMessage | null> {
  const { data } = await call(() => gmail.users.messages.get({ userId: "me", id, format: "metadata", metadataHeaders: headers }));
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
  const { data } = await call(() => gmail.users.messages.get({ userId: "me", id, format: "full" }));
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

/** Received mail from active senders (last 6 months, excluding Sent/Chats/Drafts), headers only. */
export async function scanMailbox(gmail: Gmail) {
  const { ids, capped } = await listMessageIds(gmail, scanQuery, maxScanMessages);
  const messages = await getMetadataBatch(gmail, ids, metadataHeaders);
  await addBodyUnsubscribeLinks(gmail, messages);
  return { messages, capped };
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
    call(() => gmail.users.messages.list({ userId: "me", q: `in:sent to:"${address}"`, maxResults: 1 })),
  ]);
  const messages = await getMetadataBatch(gmail, ids, metadataHeaders);
  await addBodyUnsubscribeLinks(gmail, messages);
  const correspondents = new Set<string>(sent.data.messages?.length ? [address] : []);
  return { messages, correspondents };
}

export async function getGmailProfileEmail(gmail: Gmail) {
  const { data } = await call(() => gmail.users.getProfile({ userId: "me" }));
  return data.emailAddress?.toLowerCase() ?? null;
}
