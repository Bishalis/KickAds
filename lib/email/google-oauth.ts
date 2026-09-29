import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { google } from "googleapis";

export const gmailStateCookie = "kickads-gmail-oauth-state";
export const gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";

export type GoogleOAuthClient = InstanceType<typeof google.auth.OAuth2>;

function getSecret() {
  const secret = process.env.GOOGLE_TOKEN_ENCRYPTION_SECRET;
  if (!secret) throw new Error("GOOGLE_TOKEN_ENCRYPTION_SECRET is not configured.");
  return createHash("sha256").update(secret).digest();
}

export function createGoogleOAuthClient(origin?: string): GoogleOAuthClient {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not configured.");
  }
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? (origin ? `${origin}/api/gmail/callback` : undefined);
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri);
}

export function getGmailAuthorizationUrl(client: GoogleOAuthClient, state: string) {
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: false,
    response_type: "code",
    state,
    scope: [gmailReadonlyScope],
  });
}

/** Client that can refresh its own access tokens; refreshing needs the app's client credentials. */
export function createAuthorizedClient(refreshToken: string) {
  const client = createGoogleOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(value: string): string | null {
  try {
    const [ivValue, tagValue, encryptedValue] = value.split(".");
    if (!ivValue || !tagValue || !encryptedValue) return null;
    const decipher = createDecipheriv("aes-256-gcm", getSecret(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Revoking the refresh token ends the whole grant, including any issued access tokens. */
export async function revokeGoogleGrant(refreshToken: string) {
  await createGoogleOAuthClient().revokeToken(refreshToken);
}
