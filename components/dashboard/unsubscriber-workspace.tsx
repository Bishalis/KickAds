"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  Clock3,
  Inbox,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  MailPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/actions/auth";

type UnsubscriberWorkspaceProps = {
  email: string;
};

type Sender = {
  id: string;
  name: string;
  address: string;
  description: string;
  count: number;
  category: string;
  color: string;
  initials: string;
};

const senders: Sender[] = [
  { id: "daily-digest", name: "Daily Digest", address: "hello@dailydigest.co", description: "A daily roundup of news and stories", count: 28, category: "Newsletter", color: "bg-amber-100 text-amber-700", initials: "DD" },
  { id: "product-hunt", name: "Product Hunt", address: "newsletter@producthunt.com", description: "The latest products and launches", count: 16, category: "Product", color: "bg-rose-100 text-rose-700", initials: "PH" },
  { id: "design-weekly", name: "Design Weekly", address: "team@designweekly.io", description: "Curated design inspiration each week", count: 12, category: "Newsletter", color: "bg-blue-100 text-blue-700", initials: "DW" },
  { id: "growth-notes", name: "Growth Notes", address: "notes@growthstack.com", description: "Practical ideas for growing your work", count: 9, category: "Education", color: "bg-emerald-100 text-emerald-700", initials: "GN" },
  { id: "tech-radar", name: "Tech Radar", address: "updates@techradar.dev", description: "Technology updates and analysis", count: 7, category: "Technology", color: "bg-violet-100 text-violet-700", initials: "TR" },
];

const navItems = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Unsubscriber", href: "/features/unsubscriber", icon: Inbox, active: true },
  { label: "Analytics", href: "/features/inbox-analytics", icon: BarChart3 },
  { label: "History", href: "/features/history", icon: Clock3 },
];

function Sidebar({ onClose }: { onClose?: () => void }) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-gray-200 bg-white px-4 py-5">
      <div className="flex items-center justify-between px-2">
        <Link href="/" className="flex items-center gap-2" onClick={onClose}>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-sm shadow-purple-200"><Inbox className="h-5 w-5" /></span>
          <span className="text-xl font-bold tracking-tight text-gray-950">Kick<span className="text-primary">Ads</span></span>
        </Link>
        {onClose && <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden" aria-label="Close navigation"><X className="h-5 w-5" /></button>}
      </div>
      <div className="mt-9 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Workspace</div>
      <nav className="mt-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return <Link key={item.label} href={item.href} onClick={onClose} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${item.active ? "bg-purple-50 text-primary" : "text-gray-600 hover:bg-gray-50 hover:text-gray-950"}`}><Icon className="h-4 w-4" />{item.label}</Link>;
        })}
      </nav>
      <div className="mt-8 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Manage</div>
      <nav className="mt-3 space-y-1">
        <Link href="/connect-email" onClick={onClose} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-950"><MailPlus className="h-4 w-4" />Connect email</Link>
        <Link href="/learn/how-data-is-being-used" onClick={onClose} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-950"><ShieldCheck className="h-4 w-4" />Privacy & data</Link>
        <Link href="/learn/how-it-works" onClick={onClose} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-950"><Sparkles className="h-4 w-4" />Help center</Link>
      </nav>
      <div className="mt-auto rounded-2xl bg-gray-50 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Sparkles className="h-4 w-4 text-primary" />Free plan</div><p className="mt-2 text-xs leading-5 text-gray-500">42 of 50 cleanup actions used this month.</p><Link href="/#pricing" onClick={onClose} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-purple-800">Upgrade plan <ArrowRight className="h-3.5 w-3.5" /></Link></div>
    </aside>
  );
}

export function UnsubscriberWorkspace({ email }: UnsubscriberWorkspaceProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  const filteredSenders = useMemo(() => senders.filter((sender) => {
    const matchesQuery = `${sender.name} ${sender.address}`.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === "All categories" || sender.category === category;
    return matchesQuery && matchesCategory;
  }), [category, query]);

  const selectedCount = selected.reduce((total, id) => total + (senders.find((sender) => sender.id === id)?.count ?? 0), 0);
  const allVisibleSelected = filteredSenders.length > 0 && filteredSenders.every((sender) => selected.includes(sender.id));

  function toggleSender(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setNotice("");
  }

  function toggleAllVisible() {
    const visibleIds = filteredSenders.map((sender) => sender.id);
    setSelected((current) => allVisibleSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]);
    setNotice("");
  }

  function handleUnsubscribe() {
    if (!selected.length) return;
    setNotice(`Mock action complete: ${selectedCount} emails from ${selected.length} sender${selected.length === 1 ? "" : "s"} queued for unsubscribe.`);
    setSelected([]);
  }

  return (
    <div className="min-h-screen bg-[#f8f8fb] text-gray-950">
      <div className="flex min-h-screen">
        <div className="hidden lg:block"><Sidebar /></div>
        {mobileNavOpen && <div className="fixed inset-0 z-50 flex lg:hidden"><button type="button" className="absolute inset-0 bg-gray-950/30" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" /><div className="relative z-10 h-full"><Sidebar onClose={() => setMobileNavOpen(false)} /></div></div>}
        <div className="min-w-0 flex-1">
          <header className="flex h-18 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-8">
            <div className="flex items-center gap-3"><button type="button" onClick={() => setMobileNavOpen(true)} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 lg:hidden" aria-label="Open navigation"><Menu className="h-5 w-5" /></button><div><p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-400">Workspace</p><p className="text-sm font-semibold text-gray-900">Unsubscriber</p></div></div>
            <div className="flex items-center gap-2 sm:gap-3"><span className="hidden text-sm text-gray-500 sm:block">{email}</span><span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-sm font-semibold text-primary">{email.charAt(0).toUpperCase()}</span><ChevronDown className="h-4 w-4 text-gray-400" /></div>
          </header>

          <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:py-10">
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-primary"><ArrowLeft className="h-4 w-4" />Back to overview</Link>
            <div className="mt-7 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Inbox cleanup</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">Unsubscribe from the noise.</h1><p className="mt-2 max-w-2xl text-gray-600">Review your most active senders and remove the subscriptions you no longer want.</p></div><div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm"><ShieldCheck className="h-5 w-5 text-emerald-600" /><div><p className="font-semibold text-gray-900">Private preview</p><p className="text-xs text-gray-500">Using mock inbox data</p></div></div></div>

            {notice && <div role="status" className="mt-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><Check className="h-5 w-5 shrink-0 text-emerald-600" />{notice}<button type="button" onClick={() => setNotice("")} className="ml-auto text-emerald-600 hover:text-emerald-900" aria-label="Dismiss notice"><X className="h-4 w-4" /></button></div>}

            <section className="mt-8 grid gap-4 sm:grid-cols-3"><SummaryCard label="Subscriptions found" value="24" detail="across your inbox" /><SummaryCard label="Emails to review" value="72" detail="from active senders" /><SummaryCard label="Free actions left" value="8" detail="of 50 this month" /></section>

            <section className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><h2 className="text-lg font-semibold text-gray-950">Senders to review</h2><p className="mt-1 text-sm text-gray-500">Select one or more senders to unsubscribe in bulk.</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-primary sm:w-52" placeholder="Search senders" aria-label="Search senders" /></div><select value={category} onChange={(event) => setCategory(event.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-600 outline-none focus:border-primary" aria-label="Filter by category"><option>All categories</option><option>Newsletter</option><option>Product</option><option>Education</option><option>Technology</option></select></div></div><div className="mt-5 flex items-center justify-between text-sm"><label className="flex cursor-pointer items-center gap-2 text-gray-600"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} className="h-4 w-4 accent-primary" />Select all visible</label><span className="text-gray-400">{filteredSenders.length} senders</span></div></div>
              <div className="divide-y divide-gray-100">{filteredSenders.map((sender) => <SenderRow key={sender.id} sender={sender} selected={selected.includes(sender.id)} onToggle={() => toggleSender(sender.id)} />)}{filteredSenders.length === 0 && <div className="p-12 text-center"><p className="font-semibold text-gray-900">No senders found</p><p className="mt-1 text-sm text-gray-500">Try a different search or category.</p></div>}</div>
              <div className="flex flex-col justify-between gap-4 border-t border-gray-100 bg-gray-50/70 p-5 sm:flex-row sm:items-center sm:p-6"><div><p className="text-sm font-semibold text-gray-900">{selected.length ? `${selected.length} sender${selected.length === 1 ? "" : "s"} selected` : "Nothing selected"}</p><p className="mt-1 text-xs text-gray-500">{selected.length ? `${selectedCount} emails will be included in this mock action.` : "Choose senders above to get started."}</p></div><Button type="button" onClick={handleUnsubscribe} disabled={!selected.length} className="gap-2 rounded-xl bg-primary px-5 py-2.5 text-white hover:bg-purple-800"><Inbox className="h-4 w-4" />Unsubscribe selected</Button></div>
            </section>

            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-purple-100 bg-purple-50/70 p-4 text-sm text-purple-900"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p><span className="font-semibold">How this works:</span> KickAds groups messages by sender so you can make one clear decision instead of handling every email individually.</p></div>
            <div className="mt-8 flex items-center justify-between border-t border-gray-200 pt-6"><div className="flex items-center gap-2 text-xs text-gray-500"><Settings className="h-4 w-4" />Mock data only. Your inbox is not connected yet.</div><form action={logout}><Button type="submit" variant="outline" className="border-gray-200 text-gray-600 hover:text-gray-950">Log out</Button></form></div>
          </main>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-sm text-gray-500">{label}</p><p className="mt-4 text-3xl font-bold tracking-tight text-gray-950">{value}</p><p className="mt-1 text-xs text-gray-500">{detail}</p></div>;
}

function SenderRow({ sender, selected, onToggle }: { sender: Sender; selected: boolean; onToggle: () => void }) {
  return <div className={`flex items-center gap-4 p-5 transition-colors sm:p-6 ${selected ? "bg-purple-50/60" : "hover:bg-gray-50/70"}`}><input type="checkbox" checked={selected} onChange={onToggle} className="h-4 w-4 shrink-0 accent-primary" aria-label={`Select ${sender.name}`} /><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${sender.color}`}>{sender.initials}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-gray-900">{sender.name}</p><span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">{sender.category}</span></div><p className="mt-1 truncate text-xs text-gray-500">{sender.address} <span className="hidden sm:inline">· {sender.description}</span></p></div><div className="flex shrink-0 items-center gap-3"><span className="hidden text-sm text-gray-500 sm:block">{sender.count} emails</span><button type="button" className="rounded-lg p-2 text-gray-400 hover:bg-gray-200 hover:text-gray-700" aria-label={`More options for ${sender.name}`}><MoreHorizontal className="h-4 w-4" /></button></div></div>;
}
