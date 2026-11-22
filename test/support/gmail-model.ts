import type { FakeMessage } from "./world.ts";

/**
 * How a fake mailbox answers Gmail API requests. Shared by the API tests' in-memory Gmail
 * and the browser tests' fake Gmail server, so both behave the same.
 */

const monthMs = 30.44 * 86_400_000;

/** The subset of Gmail search syntax the app sends. */
export function matchesQuery(message: FakeMessage, q = "") {
  const sent = message.labels.includes("SENT");
  // "in:sent" asks for sent mail; "-in:sent" (with the minus) excludes it.
  if (/(^|\s)in:sent\b/.test(q)) {
    if (!sent) return false;
  } else if (sent || message.labels.includes("CHAT") || message.labels.includes("DRAFT")) {
    return false;
  }
  const months = q.match(/newer_than:(\d+)m/);
  if (months && message.date < Date.now() - Number(months[1]) * monthMs) return false;
  const years = q.match(/newer_than:(\d+)y/);
  if (years && message.date < Date.now() - Number(years[1]) * 12 * monthMs) return false;
  const from = q.match(/from:"([^"]+)"/);
  if (from && !message.from.toLowerCase().includes(from[1].toLowerCase())) return false;
  const to = q.match(/to:"([^"]+)"/);
  if (to && !(message.to ?? "").toLowerCase().includes(to[1].toLowerCase())) return false;
  return true;
}

/** One page of a messages.list response, newest first. */
export function listPage(messages: FakeMessage[], q: string | undefined, pageToken: string | undefined, maxResults = 100) {
  const found = messages.filter((message) => matchesQuery(message, q)).sort((a, b) => b.date - a.date);
  const offset = Number(pageToken ?? 0);
  const page = found.slice(offset, offset + maxResults);
  return {
    messages: page.map((message) => ({ id: message.id, threadId: message.id })),
    nextPageToken: offset + maxResults < found.length ? String(offset + maxResults) : undefined,
  };
}

function headersOf(message: FakeMessage) {
  return [
    ["From", message.from],
    ...(message.to ? [["To", message.to]] : []),
    ["Subject", message.subject],
    ["Date", new Date(message.date).toUTCString()],
    ...(message.headers ?? []),
  ].map(([name, value]) => ({ name, value }));
}

/** A messages.get response in "metadata" or "full" format. */
export function messageResource(message: FakeMessage, format?: string, metadataHeaders?: string[]) {
  const wanted = metadataHeaders?.map((name) => name.toLowerCase());
  const headers = headersOf(message).filter((header) => format !== "metadata" || !wanted?.length || wanted.includes(header.name.toLowerCase()));
  const payload = format === "full"
    ? { mimeType: "multipart/alternative", headers, parts: [{ mimeType: "text/html", headers: [], body: { data: Buffer.from(message.html ?? "").toString("base64url") } }] }
    : { headers };
  return { id: message.id, threadId: message.id, labelIds: message.labels, internalDate: String(message.date), payload };
}
