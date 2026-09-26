import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { google } from "googleapis";

export const gmailTokenCookie = "kickads-gmail-token";
export const gmailStateCookie = "kickads-gmail-oauth-state";

export type GmailToken = {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  email?: string;
};

function getSecret() {
  const secret = process.env.GOOGLE_TOKEN_ENCRYPTION_SECRET;
  if (!secret) throw new Error("GOOGLE_TOKEN_ENCRYPTION_SECRET is not configured.");
  return createHash("sha256").update(secret).digest();
}

function getRedirectUri(origin: string) {
  return process.env.GOOGLE_REDIRECT_URI ?? `${origin}/api/gmail/callback`;
}

export function createGoogleOAuthClient(origin: string) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not configured.");
  }

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri(origin),
  );
}

export function getGmailAuthorizationUrl(client: ReturnType<typeof createGoogleOAuthClient>, state: string) {
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: false,
    response_type: "code",
    state,
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
  });
}

export function encryptGmailToken(token: GmailToken) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(token), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptGmailToken(value: string): GmailToken | null {
  try {
    const [ivValue, tagValue, encryptedValue] = value.split(".");
    if (!ivValue || !tagValue || !encryptedValue) return null;
    const decipher = createDecipheriv("aes-256-gcm", getSecret(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]);
    const token = JSON.parse(decrypted.toString("utf8")) as GmailToken;
    return token.userId && token.accessToken ? token : null;
  } catch {
    return null;
  }
}

export async function getGmailToken() {
  const cookieStore = await cookies();
  const value = cookieStore.get(gmailTokenCookie)?.value;
  return value ? decryptGmailToken(value) : null;
}

export async function revokeGmailToken(token: GmailToken) {
  const client = new google.auth.OAuth2();
  await client.revokeToken(token.accessToken);
}