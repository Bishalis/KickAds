import Link from "next/link";
import { ArrowUpRight, Clock3, Inbox, MailSearch, ShieldCheck, TriangleAlert } from "lucide-react";
import type { ScanStats } from "@/lib/email/classifier";
import type { GmailAccount, UnsubscribeAction } from "@/lib/email/store";
import { formatDate, methodLabels, statusLabels } from "./status";

type OverviewProps = {
  accounts: GmailAccount[];
  recentActions: UnsubscribeAction[];
  loadError?: string;
};

function sumStats(accounts: GmailAccount[]): ScanStats | null {
  const scanned = accounts.flatMap((account) => (account.lastScanStats ? [account.lastScanStats] : []));
  if (!scanned.length) return null;
  return scanned.reduce((total, stats) => ({
    analyzed: total.analyzed + stats.analyzed,
    senders: total.senders + stats.senders,
    subscriptions: total.subscriptions + stats.subscriptions,
    protected: total.protected + stats.protected,
    review: total.review + stats.review,
    ignored: total.ignored + stats.ignored,
    capped: total.capped || stats.capped,
  }));
}

export function DashboardOverview({ accounts, recentActions, loadError }: OverviewProps) {
  const usable = accounts.filter((account) => !account.locked);
  const stats = sumStats(usable);
  const lastScanAt = usable.map((account) => account.lastScanAt).filter((value): value is string => Boolean(value)).sort().at(-1);
  const connected = usable.length > 0;
  return (
    <>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">Inbox overview</h1>
          <p className="mt-2 text-gray-600">
            {connected
              ? <>Gmail connected: <span className="font-medium text-gray-900">{usable.map((account) => account.googleEmail).join(", ")}</span></>
              : "Connect Gmail to find your subscriptions."}
          </p>
        </div>
        <Link
          href={connected ? "/dashboard/unsubscriber" : "/connect-email"}
          className="inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-800"
        >
          {connected ? "Review subscriptions" : "Connect Gmail"} <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {loadError && (
        <p className="mt-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700" role="alert">{loadError}</p>
      )}

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Emails analyzed" value={stats?.analyzed} detail={lastScanAt ? `Last scan ${formatDate(lastScanAt, true)}` : "No scan yet"} icon={MailSearch} accent="text-primary" />
        <MetricCard label="Subscriptions" value={stats?.subscriptions} detail="Senders with mailing-list signals" icon={Inbox} accent="text-emerald-600" />
        <MetricCard label="Protected" value={stats?.protected} detail="Kept safe from unsubscribe" icon={ShieldCheck} accent="text-amber-600" />
        <MetricCard label="Needs review" value={stats?.review} detail="Not sure enough to decide" icon={TriangleAlert} accent="text-blue-600" />
      </section>
      {stats?.capped && (
        <p className="mt-3 text-xs text-gray-500">
          Freemium scans your newest 1,500 emails per account. <Link href="/dashboard/upgrade" className="font-medium text-primary hover:underline">Upgrade to Premium</Link> to scan all of them.
        </p>
      )}

      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">Recent unsubscribe activity</h2>
            <p className="mt-1 text-sm text-gray-500">Every unsubscribe attempt and its result.</p>
          </div>
          <Clock3 className="h-5 w-5 text-gray-400" />
        </div>
        {recentActions.length ? (
          <ul className="mt-5 divide-y divide-gray-100">
            {recentActions.map((action) => (
              <li key={action.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{action.displayName}</p>
                  <p className="truncate text-xs text-gray-500">{action.senderDomain} · {methodLabels[action.method]} · {formatDate(action.createdAt)}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusLabels[action.status].className}`}>{statusLabels[action.status].label}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 text-sm text-gray-500">No unsubscribe actions yet.</p>
        )}
        <Link href="/dashboard/history" className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-purple-800">
          See full history <ArrowUpRight className="h-4 w-4" />
        </Link>
      </section>
    </>
  );
}

function MetricCard({ label, value, detail, accent, icon: Icon }: { label: string; value?: number; detail: string; accent: string; icon: typeof ShieldCheck }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <Icon className={`h-5 w-5 ${accent}`} />
      </div>
      <p className="mt-5 text-3xl font-bold tracking-tight text-gray-950">{value ?? "—"}</p>
      <p className="mt-1 text-xs text-gray-500">{detail}</p>
    </div>
  );
}
