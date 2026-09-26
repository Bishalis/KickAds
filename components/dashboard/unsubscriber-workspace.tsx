"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  BarChart3,
  Ban,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Inbox,
  LayoutDashboard,
  MailOpen,
  Menu,
  ChevronRight,
  Filter,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  MailPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/actions/auth";
import type { GmailMessage } from "@/lib/email/gmail.ts";
import type { ClassifiedEmail, Classification } from "@/lib/email/classifier";

type UnsubscriberWorkspaceProps = {
  email: string;
};

const navItems = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Unsubscriber",
    href: "/features/unsubscriber",
    icon: Inbox,
    active: true,
  },
  { label: "Analytics", href: "/features/inbox-analytics", icon: BarChart3 },
  { label: "History", href: "/features/history", icon: Clock3 },
];

function Sidebar({ onClose }: { onClose?: () => void }) {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white px-4 py-5 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40">
      <div className="flex items-center justify-between px-2">
        <Link href="/" className="flex items-center gap-2" onClick={onClose}>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-sm shadow-purple-200">
            <Inbox className="h-5 w-5" />
          </span>
          <span className="text-xl font-bold tracking-tight text-gray-950">
            Kick<span className="text-primary">Ads</span>
          </span>
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <div className="mt-9 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
        Workspace
      </div>
      <nav className="mt-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${item.active ? "bg-purple-50 text-primary" : "text-gray-600 hover:bg-gray-50 hover:text-gray-950"}`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-8 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
        Manage
      </div>
      <nav className="mt-3 space-y-1">
        <Link
          href="/connect-email"
          onClick={onClose}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-950"
        >
          <MailPlus className="h-4 w-4" />
          Connect email
        </Link>
        <Link
          href="/learn/how-data-is-being-used"
          onClick={onClose}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-950"
        >
          <ShieldCheck className="h-4 w-4" />
          Privacy & data
        </Link>
        <Link
          href="/learn/how-it-works"
          onClick={onClose}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-950"
        >
          <Sparkles className="h-4 w-4" />
          Help center
        </Link>
      </nav>
      <div className="mt-auto rounded-2xl bg-gray-50 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Sparkles className="h-4 w-4 text-primary" />
          Free plan
        </div>
        <p className="mt-2 text-xs leading-5 text-gray-500">
          42 of 50 cleanup actions used this month.
        </p>
        <Link
          href="/#pricing"
          onClick={onClose}
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-purple-800"
        >
          Upgrade plan <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </aside>
  );
}

export function UnsubscriberWorkspace({ email }: UnsubscriberWorkspaceProps) {
  const [messages, setMessages] = useState<ClassifiedEmail[]>([]);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("");
  const [expandedSender, setExpandedSender] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [actionedSenders, setActionedSenders] = useState<
    Record<string, "kept" | "unsubscribed">
  >({});

  async function loadMessages() {
    setIsLoading(true);
    setLoadError("");
    setNotice("");
    try {
      const response = await fetch("/api/gmail");
      const data = await response.json();
      if (response.status === 401) {
        setGmailConnected(false);
        setMessages([]);
      }
      if (!response.ok)
        throw new Error(data.error ?? "Unable to read Gmail messages.");
      setMessages(data.messages ?? []);
      setPage(1);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to read Gmail messages.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    async function checkConnection() {
      try {
        const response = await fetch("/api/gmail/status");
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Unable to check Gmail connection.");
        const connected = data.gmailConnected === true;
        setGmailConnected(connected);
        if (connected) void loadMessages();
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to check Gmail connection.",
        );
      } finally {
        setIsCheckingConnection(false);
      }
    }

    void checkConnection();
  }, []);

  async function disconnectGmail() {
    await fetch("/api/gmail/disconnect", { method: "POST" });
    setGmailConnected(false);
    setMessages([]);
    setPage(1);
    setActionedSenders({});
    setNotice("Gmail disconnected. No more email data will be requested.");
  }

  const filteredMessages = useMemo(
    () =>
      messages.filter((message) => {
        const searchText = `${message.sender.displayName} ${message.sender.email} ${message.sender.domain}`;
        return searchText.toLowerCase().includes(filter.toLowerCase());
      }),
    [filter, messages],
  );
  const groupedMessages = useMemo(() => {
    const groups = new Map<string, ClassifiedEmail[]>();
    for (const message of filteredMessages) {
      const key = message.sender.domain;
      groups.set(key, [...(groups.get(key) ?? []), message]);
    }
    return [...groups.entries()].map(([key, senderMessages]) => ({
      key,
      messages: senderMessages,
    }));
  }, [filteredMessages]);
  const pageCount = Math.max(1, Math.ceil(groupedMessages.length / 20));
  const pagedGroups = groupedMessages.slice((page - 1) * 20, page * 20);

  function updateFilter(value: string) {
    setFilter(value);
    setPage(1);
    setExpandedSender(null);
  }

  async function handleSenderAction(groupKey: string, senderEmail: string, action: "kept" | "unsubscribed") {
    if (action === "unsubscribed") {
      const confirmed = window.confirm(`Unsubscribe from ${senderEmail}? This requires explicit confirmation.`);
      if (!confirmed) return;
      setNotice(`${senderEmail} is prepared as an unsubscribe candidate. No request was sent.`);
    }
    setActionedSenders((current) => ({ ...current, [groupKey]: action }));
    setNotice(
      `${senderEmail} marked to ${action === "kept" ? "keep" : "unsubscribe"}.`,
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f8fb] text-gray-950">
      <div className="flex min-h-screen">
        <div className="hidden lg:block">
          <Sidebar />
        </div>
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-gray-950/30"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation"
            />
            <div className="relative z-10 h-full">
              <Sidebar onClose={() => setMobileNavOpen(false)} />
            </div>
          </div>
        )}
        <div className="min-w-0 flex-1 lg:ml-64">
          <header className="flex h-18 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-400">
                  Workspace
                </p>
                <p className="text-sm font-semibold text-gray-900">
                  Unsubscriber
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="hidden text-sm text-gray-500 sm:block">
                {email}
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-sm font-semibold text-primary">
                {email.charAt(0).toUpperCase()}
              </span>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:py-10">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to overview
            </Link>
            <div className="mt-7 flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
                  Inbox cleanup
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
                  Unsubscribe from the noise.
                </h1>
                <p className="mt-2 max-w-2xl text-gray-600">
                  Find recent emails with clear unsubscribe options, then choose
                  what to do.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <div>
                  <p className="font-semibold text-gray-900">
                    {gmailConnected ? "Gmail connected" : "Gmail not connected"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {gmailConnected
                      ? "Ready when you are"
                      : "Connect to find unsubscribe options"}
                  </p>
                </div>
              </div>
            </div>

            {notice && (
              <div
                role="status"
                className="mt-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
              >
                <Check className="h-5 w-5 shrink-0 text-emerald-600" />
                {notice}
                <button
                  type="button"
                  onClick={() => setNotice("")}
                  className="ml-auto text-emerald-600 hover:text-emerald-900"
                  aria-label="Dismiss notice"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {!isCheckingConnection && !gmailConnected && (
              <section className="mt-8 rounded-2xl border border-purple-200 bg-purple-50 p-6">
                <h2 className="text-lg font-semibold text-gray-950">
                  Connect your Gmail
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Connect Gmail to find emails with unsubscribe options.
                </p>
                <Link
                  href="/connect-email"
                  className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-800"
                >
                  Connect Gmail
                </Link>
              </section>
            )}

            {gmailConnected && (
              <InboxReviewPanel
                filter={filter}
                onFilterChange={updateFilter}
                onDisconnect={disconnectGmail}
                isLoading={isLoading}
                loadError={loadError}
                messages={messages}
                groupedMessages={pagedGroups}
                totalGroups={groupedMessages.length}
                page={page}
                pageCount={pageCount}
                onPageChange={(nextPage) => {
                  setPage(nextPage);
                  setExpandedSender(null);
                }}
                expandedSender={expandedSender}
                actionedSenders={actionedSenders}
                onToggleSender={(sender) =>
                  setExpandedSender((current) =>
                    current === sender ? null : sender,
                  )
                }
                onSenderAction={handleSenderAction}
              />
            )}

            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-purple-100 bg-purple-50/70 p-4 text-sm text-purple-900">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p>
                <span className="font-semibold">How this works:</span> KickAds
                groups messages by sender so you can make one clear decision
                instead of handling every email individually.
              </p>
            </div>
            <div className="mt-8 flex items-center justify-between border-t border-gray-200 pt-6">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Settings className="h-4 w-4" />
                Gmail access is read-only and only used after you connect it.
              </div>
              <form action={logout}>
                <Button
                  type="submit"
                  variant="outline"
                  className="border-gray-200 text-gray-600 hover:text-gray-950"
                >
                  Log out
                </Button>
              </form>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function getMessageHeader(message: GmailMessage, name: string) {
  return (
    message.headers.find(
      (header) => header.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? ""
  );
}

function InboxReviewPanel({
  filter,
  onFilterChange,
  onDisconnect,
  isLoading,
  loadError,
  messages,
  groupedMessages,
  totalGroups,
  page,
  pageCount,
  onPageChange,
  expandedSender,
  actionedSenders,
  onToggleSender,
  onSenderAction,
}: {
  filter: string;
  onFilterChange: (value: string) => void;
  onDisconnect: () => void;
  isLoading: boolean;
  loadError: string;
  messages: ClassifiedEmail[];
  groupedMessages: Array<{ key: string; messages: ClassifiedEmail[] }>;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  expandedSender: string | null;
  actionedSenders: Record<string, "kept" | "unsubscribed">;
  totalGroups: number;
  onToggleSender: (sender: string) => void;
  onSenderAction: (groupKey: string, senderEmail: string, action: "kept" | "unsubscribed") => void;
}) {
  const shownStart = groupedMessages.length ? (page - 1) * 20 + 1 : 0;
  const shownEnd = Math.min(page * 20, totalGroups);
  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-200 bg-white p-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <Filter className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
            placeholder="Filter senders"
            className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-800 outline-none transition focus:border-primary focus:bg-white"
          />
        </label>
        <span className="text-sm text-gray-500">
          {messages.length} messages loaded across {totalGroups} domains
        </span>
        <Button
          type="button"
          variant="outline"
          onClick={onDisconnect}
          className="h-10 rounded-lg"
        >
          Disconnect
        </Button>
      </div>
      <div className="border-b border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold">Only connected Gmail data appears here.</p>
          <p className="mt-0.5 text-amber-900/75">
            Only emails received in the last 3 months are included. Domains are shown 20 per page. Nothing is loaded automatically from Google sign-in.
        </p>
      </div>
      {loadError && (
        <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}
      {!isLoading && !loadError && !messages.length && (
        <div className="p-12 text-center text-sm text-gray-500">
          Gmail messages will appear here once loading finishes.
        </div>
      )}
      <div className="divide-y divide-gray-200">
          {groupedMessages.map((group) => (
          <SenderGroup
            key={group.key}
            messages={group.messages}
            expanded={expandedSender === group.key}
            action={actionedSenders[group.key]}
            onToggle={() => onToggleSender(group.key)}
            onAction={(senderEmail, nextAction) => onSenderAction(group.key, senderEmail, nextAction)}
          />
        ))}
      </div>
      {totalGroups > 0 && (
        <Pagination
          page={page}
          pageCount={pageCount}
          shownStart={shownStart}
          shownEnd={shownEnd}
          totalCount={totalGroups}
          onPageChange={onPageChange}
        />
      )}
    </section>
  );
}

function SenderGroup({
  messages,
  expanded,
  action,
  onToggle,
  onAction,
}: {
  messages: ClassifiedEmail[];
  expanded: boolean;
  action?: "kept" | "unsubscribed";
  onToggle: () => void;
  onAction: (senderEmail: string, action: "kept" | "unsubscribed") => void;
}) {
  const domain = messages[0].sender.domain;
  const senderName = domain;
  const senderAddresses = [...new Set(messages.map((message) => message.sender.email))];
  const senderAddress = senderAddresses.length === 1 ? senderAddresses[0] : `${senderAddresses.length} sender addresses`;
  const initials = (senderName || senderAddress)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const isProtected = messages.some((message) => message.isProtected);
  const isSubscription = messages.some((message) => message.classification === "subscription");
  const unsubscribeAvailable = senderAddresses.length === 1 && !isProtected && isSubscription && messages.some((message) => message.unsubscribeAvailable && message.unsubscribe?.method === "one_click");
  const classification: Classification = isProtected && isSubscription ? "review" : isProtected ? "protected" : isSubscription ? "subscription" : "review";
  const lastReceivedAt = messages.map((message) => message.date).filter(Boolean).sort().at(-1);
  const dateLabel = lastReceivedAt ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(lastReceivedAt)) : "Date unavailable";
  return (
    <div>
      <div className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-gray-50 sm:px-6">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-4 text-left"
        >
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-sm font-bold text-orange-700">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate text-base font-semibold text-gray-900">
                {senderName || "Unknown sender"}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${classification === "protected" ? "bg-amber-100 text-amber-800" : classification === "subscription" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-500"}`}>
                {classification}
              </span>
            </span>
            <span className="mt-1 block truncate text-xs text-gray-500">
              {senderAddress}
            </span>
            <span className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
              <span>{classification === "protected" ? "Protected from unsubscribe" : classification === "subscription" ? "Subscription candidate" : isProtected && isSubscription ? "Mixed content; review required" : "Needs review"}</span>
              <span aria-hidden="true">·</span>
              <span>{unsubscribeAvailable ? "One-click available" : "No supported unsubscribe option"}</span>
              <span aria-hidden="true">·</span>
              <span>Last received {dateLabel}</span>
            </span>
          </span>
          <span className="hidden text-right sm:block">
            <span className="block text-2xl font-semibold leading-none text-gray-900">
              {messages.length}
            </span>
            <span className="mt-1 block text-xs text-gray-500">emails</span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onAction(senderAddresses[0], "kept")}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${action === "kept" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            <Archive className="h-3.5 w-3.5" />
            {action === "kept" ? "Kept" : "Keep"}
          </button>
          <button
            type="button"
            onClick={() => onAction(senderAddresses[0], "unsubscribed")}
            disabled={!unsubscribeAvailable || action === "unsubscribed"}
            title={isProtected ? "Protected email: unsubscribe is disabled" : "Explicit confirmation is required"}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${action === "unsubscribed" ? "bg-rose-100 text-rose-800" : "bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"}`}
          >
            <Ban className="h-3.5 w-3.5" />
            {action === "unsubscribed" ? "Prepared" : unsubscribeAvailable ? "Unsubscribe" : classification === "protected" ? "Protected" : "Review"}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-2 sm:px-6">
          {messages.map((message) => (
            <GmailMessageRow key={message.id} message={message} />
          ))}
        </div>
      )}
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  shownStart,
  shownEnd,
  totalCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  shownStart: number;
  shownEnd: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex flex-col gap-3 border-t border-gray-200 px-5 py-4 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
      <span>
        Showing domains {shownStart}-{shownEnd} of {totalCount}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="rounded-lg px-3 py-1.5 text-sm hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Prev
        </button>
        {Array.from({ length: pageCount }, (_, index) => index + 1).map(
          (pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              onClick={() => onPageChange(pageNumber)}
              className={`h-8 min-w-8 rounded-lg px-2 text-sm ${pageNumber === page ? "bg-primary font-semibold text-white" : "text-gray-600 hover:bg-gray-100"}`}
            >
              {pageNumber}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          disabled={page === pageCount}
          className="rounded-lg px-3 py-1.5 text-sm hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function GmailMessageRow({ message }: { message: ClassifiedEmail }) {
  const getHeader = (name: string) => getMessageHeader(message, name);
  const sender = getHeader("From") || "Unknown sender";
  const subject = getHeader("Subject") || "(No subject)";
  const date = getHeader("Date");
  const senderMatch = sender.match(/^(.*?)(?:\s*<([^>]+)>)?$/);
  const senderName = senderMatch?.[2]
    ? senderMatch[1].replace(/^"|"$/g, "").trim()
    : sender.split("@")[0];
  const senderAddress = senderMatch?.[2] ?? sender;
  const initials = (senderName || senderAddress)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const formattedDate = date
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
      }).format(new Date(date))
    : "Date unavailable";
  const visibleLabels = (message.labelIds ?? [])
    .filter(
      (label) => !["INBOX", "UNREAD", "CATEGORY_PERSONAL"].includes(label),
    )
    .slice(0, 2);

  return (
    <article className="group flex gap-4 border-l-2 border-transparent p-5 transition-colors hover:border-primary hover:bg-purple-50/40 sm:p-6">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-purple-100 text-sm font-bold text-primary">
        {initials || <MailOpen className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p
              className="truncate text-sm font-semibold text-gray-950"
              title={senderName || senderAddress}
            >
              {senderName || "Unknown sender"}
            </p>
            <p className="truncate text-xs text-gray-500" title={senderAddress}>
              {senderAddress}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-xs text-gray-400">
            <CalendarDays className="h-3.5 w-3.5" />
            <time dateTime={date || undefined}>{formattedDate}</time>
          </div>
        </div>
        <p
          className="mt-3 truncate text-sm font-medium text-gray-800"
          title={subject}
        >
          {subject}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${message.classification === "protected" ? "bg-amber-100 text-amber-800" : message.classification === "subscription" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-500"}`}>{message.classification} · {message.confidence} confidence</span>
          {message.category !== "unknown" && <span className="rounded-full bg-purple-50 px-2 py-1 text-[11px] font-medium text-purple-700">{message.category}</span>}
          {visibleLabels.map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-500"
            >
              <Tag className="h-3 w-3" />
              {label.toLowerCase().replaceAll("_", " ")}
            </span>
          ))}
          <span className="text-[11px] text-gray-400">
            Message ID: {message.id.slice(0, 12)}...
          </span>
        </div>
      </div>
    </article>
  );
}
