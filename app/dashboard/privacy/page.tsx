import { InfoPage } from "@/components/dashboard/info-page";

export default function PrivacyPage() {
  return (
    <InfoPage
      title="Privacy & data"
      intro="Exactly what KickAds can see in your Gmail, what it keeps, and how to take access away."
      sections={[
        {
          title: "When we get access",
          items: [
            "Signing in to KickAds, including with Google, gives us no access to your email.",
            "We only read Gmail after you click Connect Gmail and approve read-only access at Google.",
            "Read-only means we can't send, change, move, or delete any email in your account.",
          ],
        },
        {
          title: "What we read during a scan",
          items: [
            "Headers of email you received in the last 6 months: sender, subject, date, unsubscribe headers, mailing-list ID, and Gmail's sender verification results.",
            "Recipient addresses from up to 200 recent emails you sent, so people you write to are protected.",
            "For up to 40 senders with no unsubscribe header, the body of their newest email, only to look for an unsubscribe link. The body is discarded immediately.",
          ],
        },
        {
          title: "What we store",
          items: [
            "Your Gmail address and an encrypted Google access token, so scans work without reconnecting.",
            "The totals from your last scan (emails analyzed, subscriptions, protected, needs review).",
            "The senders and domains you protect or ignore.",
            "Your unsubscribe history: sender, method, time, and result.",
            "We don't store email bodies, subjects, or lists of your messages. Scan results stay in your open browser tab and disappear when you close or refresh it.",
          ],
        },
        {
          title: "What leaves your account",
          items: [
            "Nothing is sent to a sender unless you click Unsubscribe and confirm.",
            "For one-click unsubscribes, we send a single standard request to the sender's own unsubscribe address. Requests to private or internal network addresses are blocked.",
            "Other unsubscribe methods are handed to you to finish on the sender's page or in your mail app.",
          ],
        },
        {
          title: "Taking access away",
          items: [
            "Disconnect Gmail on the Connect email page. This revokes our access at Google and deletes the stored token.",
            "You can also remove KickAds from your Google account's security settings at any time.",
          ],
        },
      ]}
    />
  );
}
