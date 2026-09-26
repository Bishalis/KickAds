import { google } from "googleapis";
import type { GmailToken } from "@/lib/email/google-oauth";

export type GmailMessage = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  headers: Array<{ name: string; value: string }>;
};

type GmailMessageResponse = {
  data: {
    id?: string | null;
    threadId?: string | null;
    labelIds?: string[] | null;
    payload?: {
      headers?: Array<{ name?: string | null; value?: string | null }> | null;
    } | null;
  };
};

export function getGmailApiError(error: unknown) {
  const candidate = error as {
    code?: number;
    response?: { status?: number; data?: { error?: { message?: string; status?: string } | string; error_description?: string } };
    message?: string;
  };
  const status = candidate.response?.status ?? candidate.code;
  const responseError = candidate.response?.data?.error;
  const message = (typeof responseError === "string" ? responseError : responseError?.message)
    || candidate.response?.data?.error_description
    || candidate.message;
  return {
    status,
    message: message || (status === 401 || status === 403 || status === 400
      ? "Gmail authorization expired or was revoked. Please reconnect Gmail."
      : status === 429
        ? "Gmail is temporarily rate-limiting requests. Please try again shortly."
      : "Unable to read Gmail messages."),
  };
}

function getErrorStatus(error: unknown) {
  const candidate = error as { code?: number; response?: { status?: number } };
  return candidate.response?.status ?? candidate.code;
}

export async function getGmailInfo(token: GmailToken): Promise<GmailMessage[]> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token.accessToken, refresh_token: token.refreshToken });
  if (token.refreshToken) {
    const refreshed = await auth.getAccessToken();
    if (refreshed.token) auth.setCredentials({ access_token: refreshed.token, refresh_token: token.refreshToken });
  }
  const gmail = google.gmail({ version: "v1", auth });
  const messageRefs: Array<{ id?: string | null }> = [];
  let pageToken: string | undefined;

  do {
    const listed = await gmail.users.messages.list({
      userId: "me",
      maxResults: 100,
      pageToken,
      q: "newer_than:3m",
    });
    messageRefs.push(...(listed.data.messages ?? []));
    pageToken = listed.data.nextPageToken ?? undefined;
  } while (pageToken);

  const messages: Array<GmailMessageResponse | null> = [];
  for (let index = 0; index < messageRefs.length; index += 10) {
    const batch = await Promise.allSettled(messageRefs.slice(index, index + 10).map(({ id }) => id ? gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Subject", "Date", "Reply-To", "List-Unsubscribe", "List-Unsubscribe-Post"],
    }) : Promise.resolve(null)));
    for (const result of batch) {
      if (result.status === "fulfilled") messages.push(result.value as GmailMessageResponse | null);
      else {
        const status = getErrorStatus(result.reason);
        if (status === 401 || status === 403) throw result.reason;
      }
    }
  }

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);

  return messages.flatMap((response) => {
    if (!response?.data.id) return [];
    const headers = (response.data.payload?.headers ?? []).flatMap((header) => (
      header.name && header.value ? [{ name: header.name, value: header.value }] : []
    ));
    const date = headers.find((header) => header.name.toLowerCase() === "date")?.value;
    if (date && !Number.isNaN(Date.parse(date)) && new Date(date) < cutoff) return [];
    return [{
      id: response.data.id,
      threadId: response.data.threadId ?? undefined,
      labelIds: response.data.labelIds ?? undefined,
      headers,
    }];
  });
}
