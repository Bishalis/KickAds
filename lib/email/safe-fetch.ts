import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { parseUnsubscribeUrl } from "./unsubscribe.ts";

const nonPublicRanges = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) nonPublicRanges.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  // No ::ffff:0:0/96 entry: BlockList matches IPv4 against it, which would block everything.
  // IPv4-mapped addresses are unwrapped in isPublicAddress instead.
  ["::", 127], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32],
  ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) nonPublicRanges.addSubnet(network, prefix, "ipv6");

export function isPublicAddress(value: string) {
  const address = value.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "");
  const family = isIP(address);
  // Hex-form IPv4-mapped addresses (::ffff:7f00:1) never come from a legitimate lookup.
  if (!family || /^::ffff:/i.test(address)) return false;
  return !nonPublicRanges.check(address, family === 4 ? "ipv4" : "ipv6");
}

export type OneClickResult =
  | { kind: "accepted"; status: number }
  | { kind: "redirected"; status: number }
  | { kind: "rejected"; status: number }
  | { kind: "error"; detail: string };

const timeoutMs = 10_000;
const maxResponseBytes = 64 * 1024;

/**
 * Sends an RFC 8058 one-click unsubscribe POST. The URL comes from an email, so it is
 * attacker-controlled: the host is resolved once, every address must be public, and the
 * connection is pinned to that address (no DNS rebinding). No cookies or credentials are
 * sent and redirects are never followed.
 */
export async function sendOneClickUnsubscribe(target: string): Promise<OneClickResult> {
  const url = parseUnsubscribeUrl(target);
  if (!url) return { kind: "error", detail: "The unsubscribe URL is not a valid HTTPS address." };

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    return { kind: "error", detail: "The unsubscribe host could not be resolved." };
  }
  if (!resolved.length || resolved.some((entry) => !isPublicAddress(entry.address))) {
    return { kind: "error", detail: "The unsubscribe host points to a private network address and was blocked." };
  }
  const pinned = resolved[0];
  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all) callback(null, [{ address: pinned.address, family: pinned.family }]);
    else callback(null, pinned.address, pinned.family);
  };

  const body = "List-Unsubscribe=One-Click";
  return new Promise((resolve) => {
    const req = request({
      protocol: "https:",
      host: url.hostname,
      servername: url.hostname,
      port: 443,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      lookup: pinnedLookup,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent": "KickAds-Unsubscribe/1.0",
      },
    }, (response) => {
      const status = response.statusCode ?? 0;
      let received = 0;
      response.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > maxResponseBytes) response.destroy();
      });
      response.on("close", () => {
        if (status >= 200 && status < 300) resolve({ kind: "accepted", status });
        else if (status >= 300 && status < 400) resolve({ kind: "redirected", status });
        else resolve({ kind: "rejected", status });
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolve({
      kind: "error",
      detail: error.message === "timeout" ? "The sender did not respond in time." : "Could not reach the sender's unsubscribe endpoint.",
    }));
    req.end(body);
  });
}
