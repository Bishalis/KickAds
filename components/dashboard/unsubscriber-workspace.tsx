"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, ChevronRight, EyeOff, Filter, Loader2, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Classification, SenderRule } from "@/lib/email/classifier";
import type { GmailAccount } from "@/lib/email/store";
import { planLimits, planUsageChangedEvent, type Plan } from "@/lib/plans";
import { getScanSnapshot, setScanSnapshot, type AccountScan, type CachedSender as Sender, type UnsubscribeResult } from "./scan-cache";
import { formatDate, methodLabels, statusLabels } from "./status";

type Tab = Classification | "ignored";

const tabs: Array<{ id: Tab; label: string; empty: string }> = [
  { id: "subscription", label: "Subscriptions", empty: "No subscriptions found in recent email." },
  { id: "review", label: "Needs review", empty: "Nothing needs review." },
  { id: "protected", label: "Protected", empty: "No protected senders yet." },
  { id: "ignored", label: "Ignored", empty: "You haven't ignored any senders." },
];
const pageSize = 25;

const classificationStyles: Record<Classification, string> = {
  subscription: "bg-emerald-100 text-emerald-800",
  protected: "bg-amber-100 text-amber-800",
  review: "bg-gray-100 text-gray-600",
};

function ruleMatches(rule: SenderRule, sender: Sender) {
  return rule.matchType === "address"
    ? rule.value === sender.address
    : sender.domain === rule.value || sender.domain.endsWith(`.${rule.value}`);
}

function tabOf(sender: Sender): Tab {
  return sender.ignored ? "ignored" : sender.classification;
}

export function UnsubscriberWorkspace() {
  // Reuse earlier scans when coming back to this page; only Rescan fetches again.
  const [cached] = useState(getScanSnapshot);
  const [checked, setChecked] = useState(Boolean(cached));
  const [plan, setPlan] = useState<Plan>(cached?.plan ?? "free");
  const [accounts, setAccounts] = useState<GmailAccount[]>(cached?.accounts ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(cached?.selectedAccountId ?? null);
  const [scans, setScans] = useState<Record<string, AccountScan>>(cached?.scans ?? {});
  const [scanning, setScanning] = useState<{ accountId: string; scanned: number } | null>(null);
  const [error, setError] = useState<{ message: string; upgrade?: boolean } | null>(null);
  const [tab, setTab] = useState<Tab>("subscription");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selected = accounts.find((account) => account.id === selectedId) ?? null;
  const current = selectedId ? scans[selectedId] : undefined;
  const senders = useMemo(() => current?.senders ?? [], [current]);
  const rules = current?.rules ?? [];
  const stats = current?.stats ?? null;
  const results = current?.results ?? {};
  const isScanning = scanning?.accountId === selectedId;

  useEffect(() => {
    if (checked) setScanSnapshot({ plan, accounts, selectedAccountId: selectedId, scans });
  }, [checked, plan, accounts, selectedId, scans]);

  // Stop an in-flight scan when leaving the page, so it doesn't keep using Gmail quota.
  useEffect(() => () => abortRef.current?.abort(), []);

  function updateScan(accountId: string, update: (scan: AccountScan) => AccountScan) {
    setScans((all) => (all[accountId] ? { ...all, [accountId]: update(all[accountId]) } : all));
  }

  function forgetAccount(accountId: string) {
    setAccounts((all) => all.filter((account) => account.id !== accountId));
    setScans((all) => Object.fromEntries(Object.entries(all).filter(([id]) => id !== accountId)));
    setSelectedId((id) => (id === accountId ? null : id));
  }

  /** Runs a scan batch by batch; each request returns a cursor for the next one. */
  async function scan(accountId: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setScanning({ accountId, scanned: 0 });
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
        if (data.gmailConnected === false) forgetAccount(accountId);
        if (!response.ok) {
          setError({ message: data.error ?? "Could not scan your inbox.", upgrade: data.upgradeRequired === true });
          return;
        }
        if (!data.done) {
          cursor = data.cursor;
          setScanning({ accountId, scanned: data.scanned });
          continue;
        }
        setScans((all) => ({ ...all, [accountId]: { senders: data.senders, rules: data.rules, stats: data.stats, results: all[accountId]?.results ?? {} } }));
        setPage(1);
        return;
      }
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
    if (cached) return;
    async function start() {
      try {
        const response = await fetch("/api/gmail/status");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not check the Gmail connection.");
        const firstUsable = (data.accounts as GmailAccount[]).find((account) => !account.locked);
        setPlan(data.plan);
        setAccounts(data.accounts);
        setSelectedId(firstUsable?.id ?? null);
        setChecked(true);
        if (firstUsable) await scan(firstUsable.id);
      } catch (statusError) {
        setChecked(true);
        setError({ message: statusError instanceof Error ? statusError.message : "Could not check the Gmail connection." });
      }
    }
    void start();
    // Runs once per visit; `cached` is fixed for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectAccount(accountId: string) {
    setSelectedId(accountId);
    setPage(1);
    setExpanded(null);
    if (!scans[accountId]) void scan(accountId);
  }

  const counts = useMemo(() => {
    const result: Record<Tab, number> = { subscription: 0, review: 0, protected: 0, ignored: 0 };
    for (const sender of senders) result[tabOf(sender)] += 1;
    return result;
  }, [senders]);

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return senders.filter((sender) => tabOf(sender) === tab && (!query || `${sender.displayName} ${sender.address} ${sender.domain}`.toLowerCase().includes(query)));
  }, [senders, tab, filter]);
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageItems = visible.slice((page - 1) * pageSize, page * pageSize);

  /**
   * Applies a rule change locally to every account's results (rules are shared across
   * accounts); the server re-checks everything before any unsubscribe.
   */
  function applyRules(nextRules: SenderRule[]) {
    const apply = (sender: Sender): Sender => {
      const protect = nextRules.find((rule) => rule.kind === "protect" && ruleMatches(rule, sender));
      const ignore = nextRules.find((rule) => rule.kind === "ignore" && ruleMatches(rule, sender));
      if (protect) {
        return { ...sender, classification: "protected", protectedBy: protect.matchType, ignored: false, execution: "none", reasons: [`You protected this ${protect.matchType === "domain" ? "domain" : "sender"}`] };
      }
      if (sender.protectedBy) {
        // The original classification isn't known without a rescan, so fall back to the cautious option.
        return { ...sender, classification: "review", protectedBy: null, ignored: Boolean(ignore), reasons: ["Protection removed. Rescan to classify this sender again."] };
      }
      return { ...sender, ignored: Boolean(ignore) };
    };
    setScans((all) => Object.fromEntries(Object.entries(all).map(([id, scan]) => [id, { ...scan, rules: nextRules, senders: scan.senders.map(apply) }])));
  }

  async function changeRule(sender: Sender, kind: SenderRule["kind"], matchType: SenderRule["matchType"], enable: boolean) {
    setBusy(sender.key);
    setError(null);
    try {
      const value = matchType === "address" ? sender.address : sender.domain;
      const existing = rules.find((rule) => rule.kind === kind && rule.matchType === matchType && ruleMatches(rule, sender));
      const response = enable
        ? await fetch("/api/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, matchType, value }) })
        : await fetch(`/api/rules?id=${encodeURIComponent(existing?.id ?? "")}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update the sender rule.");
      applyRules(data.rules);
    } catch (ruleError) {
      setError({ message: ruleError instanceof Error ? ruleError.message : "Could not update the sender rule." });
    } finally {
      setBusy(null);
    }
  }

  async function unsubscribe(sender: Sender) {
    if (!selectedId) return;
    const accountId = selectedId;
    setBusy(sender.key);
    setConfirming(null);
    let result: UnsubscribeResult;
    try {
      const response = await fetch("/api/gmail/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, key: sender.key, confirmed: true, acknowledgeReview: sender.classification === "review" }),
      });
      const data = await response.json();
      if (data.gmailConnected === false) forgetAccount(accountId);
      result = response.ok
        ? { status: data.status, detail: data.detail, manualUrl: data.manualUrl, mailto: data.mailto }
        : { status: "failed", detail: data.error ?? "The unsubscribe request failed.", upgrade: data.upgradeRequired === true };
      if (response.ok) window.dispatchEvent(new Event(planUsageChangedEvent));
    } catch {
      result = { status: "failed", detail: "The unsubscribe request failed. Check your connection and try again." };
    }
    updateScan(accountId, (scan) => ({ ...scan, results: { ...scan.results, [sender.key]: result } }));
    setBusy(null);
  }

  if (!checked) {
    return <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking your Gmail connection...</p>;
  }

  const usableAccounts = accounts.filter((account) => !account.locked);

  return (
    <>
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">Subscriptions</h1>
          <p className="mt-2 max-w-2xl text-gray-600">
            Senders who emailed you in the last 6 months, grouped by address. Nothing is unsubscribed unless you choose it.
          </p>
        </div>
        {selected && (
          <div className="flex flex-wrap items-center gap-2">
            {accounts.length > 1 && (
              <select
                value={selected.id}
                onChange={(event) => selectAccount(event.target.value)}
                disabled={Boolean(scanning)}
                aria-label="Gmail account"
                className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-primary"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id} disabled={account.locked}>
                    {account.googleEmail}{account.locked ? " (Premium only)" : ""}
                  </option>
                ))}
              </select>
            )}
            <Button type="button" variant="outline" onClick={() => scan(selected.id)} disabled={Boolean(scanning)} className="h-10 gap-2 rounded-lg">
              <RefreshCw className={`h-4 w-4 ${isScanning ? "animate-spin" : ""}`} /> {isScanning ? "Scanning..." : "Rescan"}
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error.message}
          {error.upgrade && <> <Link href="/dashboard/upgrade" className="font-semibold underline">See plans</Link></>}
        </p>
      )}

      {!usableAccounts.length ? (
        <section className="mt-8 rounded-2xl border border-purple-200 bg-purple-50 p-6">
          <h2 className="text-lg font-semibold text-gray-950">Connect your Gmail</h2>
          <p className="mt-1 text-sm text-gray-600">Signing in doesn&apos;t give us access to your email. Connect Gmail separately to find subscriptions.</p>
          <Link href="/connect-email" className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-800">Connect Gmail</Link>
        </section>
      ) : (
        <section className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap gap-1 border-b border-gray-200 p-2">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { setTab(item.id); setPage(1); setExpanded(null); }}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === item.id ? "bg-purple-50 text-primary" : "text-gray-600 hover:bg-gray-50"}`}
              >
                {item.label} <span className="ml-1 text-xs text-gray-400">{counts[item.id]}</span>
              </button>
            ))}
          </div>
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
              {stats ? `${stats.analyzed.toLocaleString("en")} emails from ${stats.senders.toLocaleString("en")} senders · ${selected?.googleEmail}` : selected?.googleEmail}
            </span>
          </div>

          {stats?.capped && plan === "free" && (
            <p className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Freemium scans your newest {planLimits.free.maxScanMessages?.toLocaleString("en")} emails, so older senders may be missing.{" "}
              <Link href="/dashboard/upgrade" className="font-semibold underline">Upgrade to Premium</Link> to scan every email from the last 6 months.
            </p>
          )}

          {isScanning && (
            <p className="flex items-center justify-center gap-2 border-b border-gray-100 p-6 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {scanning.scanned ? `Scanning... ${scanning.scanned.toLocaleString("en")} emails so far` : "Scanning your inbox..."}
            </p>
          )}
          {!isScanning && !pageItems.length && <p className="p-12 text-center text-sm text-gray-500">{tabs.find((item) => item.id === tab)?.empty}</p>}

          <div className="divide-y divide-gray-200">
            {pageItems.map((sender) => (
              <SenderRow
                key={sender.key}
                sender={sender}
                expanded={expanded === sender.key}
                confirming={confirming === sender.key}
                busy={busy === sender.key}
                result={results[sender.key]}
                onToggle={() => setExpanded((open) => (open === sender.key ? null : sender.key))}
                onStartUnsubscribe={() => setConfirming(sender.key)}
                onCancelUnsubscribe={() => setConfirming(null)}
                onUnsubscribe={() => unsubscribe(sender)}
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
        Gmail access is read-only. Only sender details and subjects are shown; email bodies are never stored.
      </p>
    </>
  );
}

function SenderRow({ sender, expanded, confirming, busy, result, onToggle, onStartUnsubscribe, onCancelUnsubscribe, onUnsubscribe, onRule }: {
  sender: Sender;
  expanded: boolean;
  confirming: boolean;
  busy: boolean;
  result?: UnsubscribeResult;
  onToggle: () => void;
  onStartUnsubscribe: () => void;
  onCancelUnsubscribe: () => void;
  onUnsubscribe: () => void;
  onRule: (kind: SenderRule["kind"], matchType: SenderRule["matchType"], enable: boolean) => void;
}) {
  const canUnsubscribe = sender.classification !== "protected" && sender.execution !== "none";
  const lastStatus = result?.status ?? sender.lastAction?.status;
  const actionClass = "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";

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
              {lastStatus && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusLabels[lastStatus].className}`}>{statusLabels[lastStatus].label}</span>}
            </span>
            <span className="mt-1 block truncate text-xs text-gray-500">{sender.address || "Unreadable sender"}{sender.listId ? ` · list ${sender.listId}` : ""}</span>
            <span className="mt-1 block text-[11px] text-gray-400">
              {sender.emailCount} email{sender.emailCount === 1 ? "" : "s"} · last {formatDate(sender.lastReceivedAt)} · {sender.execution === "automatic" ? "One-click unsubscribe" : sender.execution === "manual" ? `${methodLabels[sender.unsubscribeMethod]} (you finish it)` : "No unsubscribe option"}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button type="button" onClick={onStartUnsubscribe} disabled={!canUnsubscribe || busy} className={`${actionClass} bg-rose-50 text-rose-700 hover:bg-rose-100`}>
            <Ban className="h-3.5 w-3.5" /> Unsubscribe
          </button>
          {sender.protectedBy ? (
            <button type="button" onClick={() => onRule("protect", sender.protectedBy!, false)} disabled={busy} className={`${actionClass} bg-gray-100 text-gray-700 hover:bg-gray-200`}>
              <ShieldOff className="h-3.5 w-3.5" /> Unprotect {sender.protectedBy === "domain" ? "domain" : ""}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => onRule("protect", "address", true)} disabled={busy || !sender.address} className={`${actionClass} bg-amber-50 text-amber-800 hover:bg-amber-100`}>
                <ShieldCheck className="h-3.5 w-3.5" /> Protect sender
              </button>
              <button type="button" onClick={() => onRule("protect", "domain", true)} disabled={busy || !sender.domain} className={`${actionClass} bg-amber-50 text-amber-800 hover:bg-amber-100`}>
                Protect {sender.domain || "domain"}
              </button>
            </>
          )}
          <button type="button" onClick={() => onRule("ignore", "address", !sender.ignored)} disabled={busy || !sender.address || Boolean(sender.protectedBy)} className={`${actionClass} bg-gray-100 text-gray-700 hover:bg-gray-200`}>
            <EyeOff className="h-3.5 w-3.5" /> {sender.ignored ? "Unignore" : "Ignore"}
          </button>
          <button type="button" onClick={onToggle} className={`${actionClass} text-primary hover:bg-purple-50`}>Review</button>
        </div>
      </div>

      {confirming && (
        <UnsubscribeConfirmation sender={sender} onCancel={onCancelUnsubscribe} onConfirm={onUnsubscribe} />
      )}

      {busy && <p className="mt-3 flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Working...</p>}

      {result && (
        <div className={`mt-3 rounded-lg p-3 text-sm ${statusLabels[result.status].className}`} role="status">
          <p>{result.detail}</p>
          {result.manualUrl && (
            <a href={result.manualUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-block font-semibold underline">
              Open the sender&apos;s unsubscribe page
            </a>
          )}
          {result.mailto && (
            <a href={result.mailto} className="mt-2 inline-block font-semibold underline">Open the unsubscribe email in your mail app</a>
          )}
          {result.upgrade && <Link href="/dashboard/upgrade" className="mt-2 inline-block font-semibold underline">See plans</Link>}
          {(result.manualUrl || result.mailto) && <p className="mt-2 text-xs">When you&apos;re done, mark it as finished in <Link href="/dashboard/history" className="underline">History</Link>.</p>}
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
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recent subjects</p>
            <ul className="mt-2 space-y-1 text-gray-700">
              {sender.sampleSubjects.map((subject, index) => <li key={index} className="truncate">{subject}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function UnsubscribeConfirmation({ sender, onCancel, onConfirm }: { sender: Sender; onCancel: () => void; onConfirm: () => void }) {
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
