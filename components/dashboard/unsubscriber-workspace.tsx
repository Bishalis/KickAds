"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Check, ChevronRight, EyeOff, Filter, Loader2, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Classification, ScanStats, SenderRule } from "@/lib/email/classifier";
import type { GmailAccount, UnsubscribeStatus } from "@/lib/email/store";
import type { SubscriptionStatus, SubscriptionTab, SubscriptionView } from "@/lib/email/subscriptions";
import { planLimits, planUsageChangedEvent, type Plan } from "@/lib/plans";
import { formatDate, methodLabels, statusLabels } from "./status";

type Mode = "subscriptions" | "protected";
type UnsubscribeResult = { status: UnsubscribeStatus; detail: string; actionId?: string | null; manualUrl?: string; mailto?: string; upgrade?: boolean };
type Counts = Record<SubscriptionTab, number>;

const tabs: Array<{ id: SubscriptionTab; label: string; empty: string }> = [
  { id: "subscription", label: "Subscriptions", empty: "No subscriptions found in recent email." },
  { id: "review", label: "Needs review", empty: "Nothing needs review." },
  { id: "ignored", label: "Ignored", empty: "You haven't ignored any senders." },
];
const pageSize = 25;

const classificationStyles: Record<Classification, string> = {
  subscription: "bg-emerald-100 text-emerald-800",
  protected: "bg-amber-100 text-amber-800",
  review: "bg-gray-100 text-gray-600",
};

/**
 * Lists stored senders for one Gmail account. Lists come from the database, so opening the
 * page never rescans Gmail; a scan runs only the first time or when the user clicks Rescan.
 * In "protected" mode it shows protected senders only, and unsubscribing isn't offered.
 */
export function UnsubscriberWorkspace({ mode = "subscriptions" }: { mode?: Mode }) {
  const [plan, setPlan] = useState<Plan>("free");
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [account, setAccount] = useState<GmailAccount | null>(null);
  const [tab, setTab] = useState<SubscriptionTab>(mode === "protected" ? "protected" : "subscription");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [senders, setSenders] = useState<SubscriptionView[]>([]);
  const [rules, setRules] = useState<SenderRule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [scanning, setScanning] = useState<{ scanned: number } | null>(null);
  const [error, setError] = useState<{ message: string; upgrade?: boolean } | null>(null);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, UnsubscribeResult>>({});
  const abortRef = useRef<AbortController | null>(null);

  /** Fetches one tab for one account from the database. Returns the account it resolved to. */
  async function loadList(nextTab: SubscriptionTab, accountId?: string | null) {
    setLoadingList(true);
    try {
      const params = new URLSearchParams({ tab: nextTab });
      if (accountId) params.set("accountId", accountId);
      const response = await fetch(`/api/subscriptions?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load your subscriptions.");
      setPlan(data.plan);
      setAccounts(data.accounts);
      setAccount(data.account);
      setCounts(data.counts);
      setSenders(data.subscriptions);
      setPage(1);
      return data.account as GmailAccount | null;
    } catch (loadError) {
      setError({ message: loadError instanceof Error ? loadError.message : "Could not load your subscriptions." });
      return null;
    } finally {
      setLoadingList(false);
      setLoaded(true);
    }
  }

  /** Scans Gmail batch by batch, then reloads the stored list. */
  async function scan(accountId: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setScanning({ scanned: 0 });
    setError(null);
    try {
      let cursor: string | undefined;
      for (;;) {
        const response = await fetch("/api/gmail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, cursor }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) {
          setError({ message: data.error ?? "Could not scan your inbox.", upgrade: data.upgradeRequired === true });
          if (data.gmailConnected === false) await loadList(tab);
          return;
        }
        if (data.done) break;
        cursor = data.cursor;
        setScanning({ scanned: data.scanned });
      }
      await loadList(tab, accountId);
    } catch (scanError) {
      if (!controller.signal.aborted) setError({ message: scanError instanceof Error ? scanError.message : "Could not scan your inbox." });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setScanning(null);
      }
    }
  }

  useEffect(() => {
    async function start() {
      const [resolved, rulesResponse] = await Promise.all([
        loadList(mode === "protected" ? "protected" : "subscription"),
        fetch("/api/rules").then((response) => (response.ok ? response.json() : { rules: [] })).catch(() => ({ rules: [] })),
      ]);
      setRules(rulesResponse.rules);
      // First visit for this account: nothing stored yet, so scan once.
      if (resolved && !resolved.locked && !resolved.lastScanAt && mode === "subscriptions") await scan(resolved.id);
    }
    void start();
    // Stop an in-flight scan when leaving the page, so it doesn't keep using Gmail quota.
    return () => abortRef.current?.abort();
    // Runs once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectTab(nextTab: SubscriptionTab) {
    setTab(nextTab);
    setExpanded(null);
    setConfirming(null);
    void loadList(nextTab, account?.id);
  }

  async function selectAccount(accountId: string) {
    setExpanded(null);
    setResults({});
    const resolved = await loadList(tab, accountId);
    if (resolved && !resolved.locked && !resolved.lastScanAt && mode === "subscriptions") await scan(resolved.id);
  }

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return query ? senders.filter((sender) => `${sender.displayName} ${sender.address} ${sender.domain}`.toLowerCase().includes(query)) : senders;
  }, [senders, filter]);
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageItems = visible.slice((page - 1) * pageSize, page * pageSize);

  function replaceSender(updated: SubscriptionView) {
    setSenders((current) => current.map((sender) => (sender.key === updated.key ? updated : sender)));
  }

  function setLocalStatus(key: string, status: SubscriptionStatus) {
    setSenders((current) => current.map((sender) => (sender.key === key ? { ...sender, status } : sender)));
  }

  async function changeRule(sender: SubscriptionView, kind: SenderRule["kind"], matchType: SenderRule["matchType"], enable: boolean) {
    setBusy(sender.key);
    setError(null);
    setNotice("");
    try {
      const value = matchType === "address" ? sender.address : sender.domain;
      const existing = rules.find((rule) => rule.kind === kind && rule.matchType === matchType && rule.value === value);
      const response = enable
        ? await fetch("/api/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, matchType, value }) })
        : await fetch(`/api/rules?id=${encodeURIComponent(existing?.id ?? "")}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update the sender rule.");
      setRules(data.rules);
      if (kind === "protect") {
        setNotice(enable
          ? `${value} is protected and moved to the Protected page.`
          : `${value} is no longer protected and is back in your lists.`);
      }
      await loadList(tab, account?.id);
    } catch (ruleError) {
      setError({ message: ruleError instanceof Error ? ruleError.message : "Could not update the sender rule." });
    } finally {
      setBusy(null);
    }
  }

  async function unsubscribe(sender: SubscriptionView) {
    if (!account || busy) return;
    setBusy(sender.key);
    setConfirming(null);
    setLocalStatus(sender.key, "unsubscribing");
    let result: UnsubscribeResult;
    try {
      const response = await fetch("/api/gmail/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id, key: sender.key, confirmed: true, acknowledgeReview: sender.classification === "review" }),
      });
      const data = await response.json();
      // The server returns the sender's stored state after the attempt; show exactly that.
      if (data.subscription) replaceSender(data.subscription);
      else setLocalStatus(sender.key, sender.status);
      result = response.ok
        ? { status: data.status, detail: data.detail, actionId: data.actionId, manualUrl: data.manualUrl, mailto: data.mailto }
        : { status: "failed", detail: data.error ?? "The unsubscribe request failed.", upgrade: data.upgradeRequired === true };
      if (response.ok) window.dispatchEvent(new Event(planUsageChangedEvent));
    } catch {
      setLocalStatus(sender.key, sender.status);
      result = { status: "failed", detail: "The unsubscribe request failed. Check your connection and try again." };
    }
    setResults((current) => ({ ...current, [sender.key]: result }));
    setBusy(null);
  }

  async function markManualDone(sender: SubscriptionView, actionId: string) {
    setBusy(sender.key);
    try {
      const response = await fetch("/api/history", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: actionId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update this sender.");
      setLocalStatus(sender.key, "unsubscribed");
      setResults((current) => ({ ...current, [sender.key]: { status: "success", detail: "Marked as unsubscribed." } }));
    } catch (markError) {
      setError({ message: markError instanceof Error ? markError.message : "Could not update this sender." });
    } finally {
      setBusy(null);
    }
  }

  if (!loaded) {
    return <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</p>;
  }

  const usableAccounts = accounts.filter((item) => !item.locked);
  const stats: ScanStats | null = account?.lastScanStats ?? null;
  const emptyText = mode === "protected"
    ? "No protected senders. Senders you protect, and ones that look important, appear here."
    : tabs.find((item) => item.id === tab)?.empty;

  return (
    <>
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">{mode === "protected" ? "Protected" : "Subscriptions"}</h1>
          <p className="mt-2 max-w-2xl text-gray-600">
            {mode === "protected"
              ? "Senders that are never offered for unsubscribe: ones you protected, and ones that look important. Nothing in Gmail is changed."
              : "Senders who emailed you in the last 6 months, grouped by address. Nothing is unsubscribed unless you choose it."}
          </p>
        </div>
        {account && !account.locked && (
          <div className="flex flex-wrap items-center gap-2">
            {accounts.length > 1 && (
              <select
                value={account.id}
                onChange={(event) => void selectAccount(event.target.value)}
                disabled={Boolean(scanning)}
                aria-label="Gmail account"
                className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-primary"
              >
                {accounts.map((item) => (
                  <option key={item.id} value={item.id} disabled={item.locked}>
                    {item.googleEmail}{item.locked ? " (Premium only)" : ""}
                  </option>
                ))}
              </select>
            )}
            {mode === "subscriptions" && (
              <Button type="button" variant="outline" onClick={() => scan(account.id)} disabled={Boolean(scanning)} className="h-10 gap-2 rounded-lg">
                <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} /> {scanning ? "Scanning..." : "Rescan"}
              </Button>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error.message}
          {error.upgrade && <> <Link href="/dashboard/upgrade" className="font-semibold underline">See plans</Link></>}
        </p>
      )}
      {notice && <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">{notice}</p>}

      {!usableAccounts.length ? (
        <section className="mt-8 rounded-2xl border border-purple-200 bg-purple-50 p-6">
          <h2 className="text-lg font-semibold text-gray-950">Connect your Gmail</h2>
          <p className="mt-1 text-sm text-gray-600">Signing in doesn&apos;t give us access to your email. Connect Gmail separately to find subscriptions.</p>
          <Link href="/connect-email" className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-800">Connect Gmail</Link>
        </section>
      ) : (
        <section className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {mode === "subscriptions" && (
            <div className="flex flex-wrap gap-1 border-b border-gray-200 p-2">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTab(item.id)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === item.id ? "bg-purple-50 text-primary" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  {item.label} {counts && <span className="ml-1 text-xs text-gray-400">{counts[item.id]}</span>}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-3 border-b border-gray-200 p-3 sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1">
              <Filter className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                value={filter}
                onChange={(event) => { setFilter(event.target.value); setPage(1); }}
                placeholder="Filter senders"
                className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-800 outline-none focus:border-primary focus:bg-white"
              />
            </label>
            <span className="text-sm text-gray-500">
              {stats && account?.lastScanAt
                ? `${stats.analyzed.toLocaleString("en")} emails scanned ${formatDate(account.lastScanAt, true)} · ${account.googleEmail}`
                : account?.googleEmail}
            </span>
          </div>

          {mode === "subscriptions" && stats?.capped && plan === "free" && (
            <p className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Freemium scans your newest {planLimits.free.maxScanMessages?.toLocaleString("en")} emails, so older senders may be missing.{" "}
              <Link href="/dashboard/upgrade" className="font-semibold underline">Upgrade to Premium</Link> to scan every email from the last 6 months.
            </p>
          )}

          {scanning && (
            <p className="flex items-center justify-center gap-2 border-b border-gray-100 p-6 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {scanning.scanned ? `Scanning... ${scanning.scanned.toLocaleString("en")} emails so far` : "Scanning your inbox..."}
            </p>
          )}
          {loadingList && !scanning && (
            <p className="flex items-center justify-center gap-2 p-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</p>
          )}
          {!loadingList && !scanning && !pageItems.length && <p className="p-12 text-center text-sm text-gray-500">{emptyText}</p>}

          <div className="divide-y divide-gray-200">
            {pageItems.map((sender) => (
              <SenderRow
                key={sender.key}
                mode={mode}
                sender={sender}
                expanded={expanded === sender.key}
                confirming={confirming === sender.key}
                busy={busy === sender.key}
                anyBusy={Boolean(busy)}
                result={results[sender.key]}
                onToggle={() => setExpanded((open) => (open === sender.key ? null : sender.key))}
                onStartUnsubscribe={() => setConfirming(sender.key)}
                onCancelUnsubscribe={() => setConfirming(null)}
                onUnsubscribe={() => unsubscribe(sender)}
                onMarkDone={(actionId) => markManualDone(sender, actionId)}
                onRule={(kind, matchType, enable) => changeRule(sender, kind, matchType, enable)}
              />
            ))}
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 text-sm text-gray-500">
              <span>Page {page} of {pageCount}</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => setPage(page - 1)} disabled={page === 1} className="rounded-lg px-3 py-1.5 hover:bg-gray-100 disabled:opacity-40">Prev</button>
                <button type="button" onClick={() => setPage(page + 1)} disabled={page === pageCount} className="rounded-lg px-3 py-1.5 hover:bg-gray-100 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </section>
      )}

      <p className="mt-6 text-xs text-gray-500">
        Gmail access is read-only. We store sender details and unsubscribe status, never email subjects or bodies.
      </p>
    </>
  );
}

function UnsubscribeButton({ sender, busy, disabled, onClick }: { sender: SubscriptionView; busy: boolean; disabled: boolean; onClick: () => void }) {
  const base = "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed";
  if (sender.status === "unsubscribed") {
    return <span className={`${base} bg-emerald-100 text-emerald-800`}><Check className="h-3.5 w-3.5" /> Unsubscribed</span>;
  }
  if (sender.status === "unsubscribing" || busy) {
    return <span className={`${base} bg-rose-50 text-rose-700`}><Loader2 className="h-3.5 w-3.5 animate-spin" /> Unsubscribing...</span>;
  }
  if (sender.execution === "none") {
    return <span className={`${base} bg-gray-100 text-gray-500`} title="No unsubscribe option was found for this sender">No unsubscribe option</span>;
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-40`}>
      <Ban className="h-3.5 w-3.5" /> Unsubscribe
    </button>
  );
}

function SenderRow({ mode, sender, expanded, confirming, busy, anyBusy, result, onToggle, onStartUnsubscribe, onCancelUnsubscribe, onUnsubscribe, onMarkDone, onRule }: {
  mode: Mode;
  sender: SubscriptionView;
  expanded: boolean;
  confirming: boolean;
  busy: boolean;
  anyBusy: boolean;
  result?: UnsubscribeResult;
  onToggle: () => void;
  onStartUnsubscribe: () => void;
  onCancelUnsubscribe: () => void;
  onUnsubscribe: () => void;
  onMarkDone: (actionId: string) => void;
  onRule: (kind: SenderRule["kind"], matchType: SenderRule["matchType"], enable: boolean) => void;
}) {
  const actionClass = "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const isProtected = sender.classification === "protected";

  return (
    <div className="px-5 py-4 sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={expanded}>
          <ChevronRight className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate text-base font-semibold text-gray-900">{sender.displayName}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${classificationStyles[sender.classification]}`}>
                {sender.classification === "review" ? "needs review" : sender.classification}
              </span>
            </span>
            <span className="mt-1 block truncate text-xs text-gray-500">{sender.address || "Unreadable sender"}{sender.listId ? ` · list ${sender.listId}` : ""}</span>
            <span className="mt-1 block text-[11px] text-gray-400">
              {sender.emailCount} email{sender.emailCount === 1 ? "" : "s"} · last {formatDate(sender.lastReceivedAt)}
              {sender.status === "unsubscribed" && sender.unsubscribedAt ? ` · unsubscribed ${formatDate(sender.unsubscribedAt)}` : ""}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {mode === "subscriptions" && !isProtected && (
            <UnsubscribeButton sender={sender} busy={busy} disabled={anyBusy} onClick={onStartUnsubscribe} />
          )}
          {sender.protectedBy ? (
            <button type="button" onClick={() => onRule("protect", sender.protectedBy!, false)} disabled={anyBusy} className={`${actionClass} bg-gray-100 text-gray-700 hover:bg-gray-200`}>
              <ShieldOff className="h-3.5 w-3.5" /> Unprotect {sender.protectedBy === "domain" ? sender.domain : ""}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => onRule("protect", "address", true)} disabled={anyBusy || !sender.address} className={`${actionClass} bg-amber-50 text-amber-800 hover:bg-amber-100`}>
                <ShieldCheck className="h-3.5 w-3.5" /> Protect sender
              </button>
              <button type="button" onClick={() => onRule("protect", "domain", true)} disabled={anyBusy || !sender.domain} className={`${actionClass} bg-amber-50 text-amber-800 hover:bg-amber-100`}>
                Protect {sender.domain || "domain"}
              </button>
            </>
          )}
          {mode === "subscriptions" && (
            <button type="button" onClick={() => onRule("ignore", "address", !sender.ignored)} disabled={anyBusy || !sender.address} className={`${actionClass} bg-gray-100 text-gray-700 hover:bg-gray-200`}>
              <EyeOff className="h-3.5 w-3.5" /> {sender.ignored ? "Unignore" : "Ignore"}
            </button>
          )}
          <button type="button" onClick={onToggle} className={`${actionClass} text-primary hover:bg-purple-50`}>Review</button>
        </div>
      </div>

      {sender.stillSending && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          This sender kept emailing after you unsubscribed. A Gmail filter can send their mail straight to the archive.
        </p>
      )}

      {confirming && sender.status === "active" && (
        <UnsubscribeConfirmation sender={sender} onCancel={onCancelUnsubscribe} onConfirm={onUnsubscribe} />
      )}

      {result && (
        <div className={`mt-3 rounded-lg p-3 text-sm ${statusLabels[result.status].className}`} role="status">
          <p>{result.detail}</p>
          {result.upgrade && <Link href="/dashboard/upgrade" className="mt-2 inline-block font-semibold underline">See plans</Link>}
          {result.manualUrl && (
            <a href={result.manualUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-block font-semibold underline">
              Open the sender&apos;s unsubscribe page
            </a>
          )}
          {result.mailto && (
            <a href={result.mailto} className="mt-2 inline-block font-semibold underline">Open the unsubscribe email in your mail app</a>
          )}
          {result.status === "manual_required" && result.actionId && sender.status === "active" && (
            <button type="button" onClick={() => onMarkDone(result.actionId!)} disabled={anyBusy} className="mt-2 block text-xs font-semibold underline">
              I&apos;ve finished unsubscribing. Mark as unsubscribed
            </button>
          )}
        </div>
      )}

      {expanded && (
        <div className="mt-4 grid gap-4 rounded-xl bg-gray-50 p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Why it&apos;s classified this way</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-gray-700">
              {sender.reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
            <p className="mt-2 text-xs text-gray-500">Confidence: {sender.confidence}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Unsubscribe</p>
            <p className="mt-2 text-gray-700">
              {isProtected ? "Not offered for protected senders."
                : sender.execution === "automatic" ? "One-click: we send the request for you."
                : sender.execution === "manual" ? `${methodLabels[sender.unsubscribeMethod]}: you finish it on the sender's side.`
                : "No unsubscribe option was found."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function UnsubscribeConfirmation({ sender, onCancel, onConfirm }: { sender: SubscriptionView; onCancel: () => void; onConfirm: () => void }) {
  const [reviewed, setReviewed] = useState(false);
  const needsReview = sender.classification === "review";
  return (
    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-sm text-gray-800">
      <p className="font-semibold">Unsubscribe from {sender.displayName}?</p>
      <p className="mt-1 text-gray-600">
        {sender.execution === "automatic"
          ? `We'll send a one-click unsubscribe request to ${sender.domain}. This can't be undone from here.`
          : "This sender doesn't support one-click unsubscribe. We'll give you their unsubscribe page or email to finish yourself."}
      </p>
      {needsReview && (
        <label className="mt-3 flex items-start gap-2 text-gray-700">
          <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} className="mt-1" />
          <span>I&apos;ve reviewed this sender ({sender.reasons.join("; ").toLowerCase()}) and still want to unsubscribe.</span>
        </label>
      )}
      <div className="mt-3 flex gap-2">
        <Button type="button" onClick={onConfirm} disabled={needsReview && !reviewed} className="h-9 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700">
          {sender.execution === "automatic" ? "Unsubscribe" : "Show unsubscribe option"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="h-9 rounded-lg px-3 text-xs">Cancel</Button>
      </div>
    </div>
  );
}
