import { DashboardOverview } from "@/components/dashboard/overview";
import { getAuthedContext, getPlan, listGmailAccounts, listUnsubscribeActions } from "@/lib/email/store";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const context = await getAuthedContext();
  if (!context) redirect("/auth/login");

  const data = await getPlan(context)
    .then((plan) => Promise.all([listGmailAccounts(context, plan), listUnsubscribeActions(context, 5)]))
    .catch((error: unknown) => {
      console.error("[dashboard] failed:", error instanceof Error ? error.message : "unknown error");
      return null;
    });
  if (!data) {
    return <DashboardOverview accounts={[]} recentActions={[]} loadError="Could not load your workspace data. Please try again." />;
  }

  // GmailAccount has no token fields, so it is safe to pass to the page.
  const [accounts, recentActions] = data;
  return <DashboardOverview accounts={accounts} recentActions={recentActions} />;
}
