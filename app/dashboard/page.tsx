import { DashboardOverview } from "@/components/dashboard/overview";
import { getAuthedContext, getGmailConnection, listUnsubscribeActions } from "@/lib/email/store";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const context = await getAuthedContext();
  if (!context) redirect("/auth/login");

  const data = await Promise.all([getGmailConnection(context), listUnsubscribeActions(context, 5)]).catch((error: unknown) => {
    console.error("[dashboard] failed:", error instanceof Error ? error.message : "unknown error");
    return null;
  });
  if (!data) {
    return <DashboardOverview connection={null} recentActions={[]} loadError="Could not load your workspace data. Please try again." />;
  }

  const [connection, recentActions] = data;
  return (
    <DashboardOverview
      // Pick fields explicitly: the refresh token must never reach the browser.
      connection={connection && { email: connection.googleEmail, lastScanAt: connection.lastScanAt, stats: connection.lastScanStats }}
      recentActions={recentActions}
    />
  );
}
