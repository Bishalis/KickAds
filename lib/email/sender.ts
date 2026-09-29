export type NormalizedSender = {
  displayName: string;
  /** Lowercased address, or "" when the From header could not be parsed. */
  email: string;
  domain: string;
};

const addressPattern = /^[^\s@<>()",;:]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

// Mailbox providers where each address is an individual person, never a brand.
const personalMailboxDomains = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me",
  "protonmail.com", "gmx.com", "gmx.net", "mail.com", "zoho.com", "yandex.com",
  "fastmail.com", "hey.com",
]);

export function isPersonalMailboxDomain(domain: string) {
  return personalMailboxDomains.has(domain);
}

export function isValidEmailAddress(value: string) {
  return value.length <= 320 && addressPattern.test(value);
}

export function isValidDomain(value: string) {
  return value.length <= 253 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value);
}

/** True when `domain` is `parent` or a subdomain of it. */
export function isSameOrSubdomain(domain: string, parent: string) {
  return domain === parent || domain.endsWith(`.${parent}`);
}

/** Decodes RFC 2047 encoded-words such as `=?UTF-8?B?...?=`; plain text passes through. */
export function decodeEncodedWords(value: string) {
  return value
    .replace(/(=\?[^?]+\?[bq]\?[^?]*\?=)\s+(?==\?)/gi, "$1")
    .replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (whole, charset: string, encoding: string, text: string) => {
      try {
        const bytes = encoding.toLowerCase() === "b"
          ? Buffer.from(text, "base64")
          : Buffer.from(text.replace(/_/g, " ").replace(/=([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))), "latin1");
        return new TextDecoder(charset.split("*")[0]).decode(bytes);
      } catch {
        return whole;
      }
    });
}

export function normalizeSender(rawFrom: string): NormalizedSender {
  const value = decodeEncodedWords(rawFrom).trim();
  const angle = value.match(/^(.*)<([^<>]+)>\s*$/);
  let displayName = "";
  let address = "";
  if (angle) {
    displayName = angle[1];
    address = angle[2];
  } else {
    // Bare address, optionally followed by an RFC 5322 comment: `jane@x.com (Jane)`.
    const bare = value.match(/^([^\s()]+)\s*(?:\((.*)\))?\s*$/);
    address = bare?.[1] ?? "";
    displayName = bare?.[2] ?? "";
  }
  address = address.trim().toLowerCase();
  displayName = displayName.trim().replace(/^"(.*)"$/, "$1").replace(/\\(.)/g, "$1").trim();

  if (!isValidEmailAddress(address)) {
    return { displayName: displayName || value || "Unknown sender", email: "", domain: "" };
  }
  const domain = address.split("@")[1];
  return { displayName: displayName || address.split("@")[0], email: address, domain };
}
