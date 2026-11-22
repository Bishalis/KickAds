import { listPage, messageResource } from "../gmail-model.ts";
import { world, type FakeGoogleAccount } from "../world.ts";

/**
 * Stand-in for the googleapis package: Google's OAuth client and the read-only Gmail
 * methods the app uses. Only reading is implemented, so any attempt to change mail fails.
 */

function apiError(status: number, error: unknown) {
  return Object.assign(new Error(`Google API error ${status}`), { response: { status, data: { error } } });
}

class FakeOAuth2 {
  credentials: { refresh_token?: string; access_token?: string } = {};


  generateAuthUrl(params: Record<string, unknown>) {
    const url = new URL("https://accounts.google.test/o/oauth2/v2/auth");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, Array.isArray(value) ? value.join(" ") : String(value));
    return url.toString();
  }

  async getToken(code: string) {
    const grant = world.google.codes.get(code);
    if (!grant) throw apiError(400, "invalid_grant");
    world.google.codes.delete(code);
    return { tokens: { access_token: `access-${grant.account.refreshToken}`, refresh_token: grant.account.refreshToken, scope: grant.scope } };
  }

  setCredentials(credentials: { refresh_token?: string; access_token?: string }) {
    this.credentials = { ...credentials };
  }

  async revokeToken(token: string) {
    world.google.revoked.push(token);
    const account = world.google.accounts.find((item) => item.refreshToken === token);
    if (account) account.revoked = true;
    return {};
  }
}

function accountFor(auth: FakeOAuth2): FakeGoogleAccount {
  const account = world.google.accounts.find((item) => item.refreshToken === auth.credentials.refresh_token);
  if (!account || account.revoked) throw apiError(400, "invalid_grant");
  return account;
}

function fakeGmail(auth: FakeOAuth2) {
  return {
    users: {
      async getProfile() {
        const account = accountFor(auth);
        world.google.calls.push({ method: "profile" });
        return { data: { emailAddress: account.email } };
      },
      messages: {
        async list({ q, pageToken, maxResults = 100 }: { q?: string; pageToken?: string; maxResults?: number }) {
          const account = accountFor(auth);
          world.google.calls.push({ method: "list", q });
          return { data: listPage(account.messages, q, pageToken, maxResults) };
        },
        async get({ id, format, metadataHeaders }: { id: string; format?: string; metadataHeaders?: string[] }) {
          const account = accountFor(auth);
          world.google.calls.push({ method: "get", id, format });
          const message = account.messages.find((item) => item.id === id);
          if (!message) throw apiError(404, { status: "NOT_FOUND" });
          return { data: messageResource(message, format, metadataHeaders) };
        },
      },
    },
  };
}

export const google = {
  auth: { OAuth2: FakeOAuth2 },
  gmail: ({ auth }: { auth: FakeOAuth2 }) => fakeGmail(auth),
};
