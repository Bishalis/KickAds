import Link from "next/link";
import { InfoPage } from "@/components/dashboard/info-page";

export default function HelpPage() {
  return (
    <InfoPage
      title="Help center"
      intro="How KickAds sorts your senders and what happens when you unsubscribe."
      sections={[
        {
          title: "Getting started",
          items: [
            <>Connect Gmail on the <Link href="/connect-email" className="font-medium text-primary hover:underline">Connect email</Link> page.</>,
            <>Open <Link href="/dashboard/unsubscriber" className="font-medium text-primary hover:underline">Subscriptions</Link>. The first scan can take up to a minute for a large inbox.</>,
            "Results are kept while you move between pages. Click Rescan to fetch fresh results.",
          ],
        },
        {
          title: "How senders are sorted",
          items: [
            "Senders are grouped by email address and mailing list, not by company domain, so unrelated mail from one company stays separate.",
            "Subscriptions have clear mailing-list signals, such as unsubscribe headers or Gmail's Promotions tab, from a sender Gmail could verify.",
            "Protected senders look important: people you email, starred mail, personal addresses, or subjects about security, payments, orders, work, school, government, or health.",
            "Needs review means the signals conflict or aren't strong enough. When in doubt, KickAds chooses review over unsubscribe.",
            "Only senders who emailed you in the last 6 months are shown. Freemium scans your newest 1,500 emails; Premium scans all of them.",
          ],
        },
        {
          title: "Your actions",
          items: [
            "Unsubscribe asks you to confirm first. For senders that need review, you also confirm that you've reviewed them.",
            "Protect sender or Protect domain blocks unsubscribing from them until you unprotect them.",
            "Ignore hides a sender from your lists without unsubscribing.",
            "Review shows why a sender was sorted the way it was, plus recent subjects.",
          ],
        },
        {
          title: "What unsubscribe results mean",
          items: [
            "Successful: the sender accepted the one-click request, or you marked a manual unsubscribe as done. Emails can take a few days to stop.",
            "Needs your action: finish on the sender's page or send the prepared email, then mark it done in History.",
            "Failed: the sender rejected or didn't answer the request. You can try their unsubscribe page instead.",
            "No unsubscribe method: no unsubscribe option was found. Consider a Gmail filter instead.",
          ],
        },
        {
          title: "Plans",
          items: [
            "Freemium: 10 unsubscribes per month (resets on the 1st, UTC), your newest 1,500 emails per scan, and 1 Gmail account.",
            "Premium: unlimited unsubscribes, every email from the last 6 months, and up to 3 Gmail accounts.",
            "An unsubscribe counts toward the limit when it succeeds or when you're given the sender's page to finish it. Failed attempts don't count.",
            <>Compare plans on the <Link href="/dashboard/upgrade" className="font-medium text-primary hover:underline">Plans</Link> page.</>,
          ],
        },
        {
          title: "Troubleshooting",
          items: [
            "\"Gmail access expired or was revoked\": connect Gmail again. This happens if access was removed at Google or the approval ran out.",
            "\"A scan just finished\": wait a few seconds before rescanning.",
          ],
        },
      ]}
    />
  );
}
