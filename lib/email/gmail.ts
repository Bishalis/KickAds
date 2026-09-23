import { google } from "googleapis";

export async function getGmailInfo(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: "v1", auth });

  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: 10,
  });

  return response.data.messages ?? [];
}