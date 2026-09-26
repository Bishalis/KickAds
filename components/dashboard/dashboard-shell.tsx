"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Inbox,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  MailPlus,
  X,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

type DashboardShellProps = {
  email: string;
};

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  active?: boolean;
};

const navItems: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard, active: true },
  { label: "Unsubscriber", href: "/features/unsubscriber", icon: Inbox },
  { label: "Analytics", href: "/features/inbox-analytics", icon: BarChart3 },
  { label: "History", href: "/features/history", icon: Clock3 },
];

const senders = [
  { name: "Daily Digest", address: "hello@dailydigest.co", count: 28, category: "Newsletter", color: "bg-amber-100 text-amber-700" },
  { name: "Product Hunt", address: "newsletter@producthunt.com", count: 16, category: "Product", color: "bg-rose-100 text-rose-700" },
  { name: "Design Weekly", address: "team@designweekly.io", count: 12, category: "Newsletter", color: "bg-blue-100 text-blue-700" },
];

const activity = [
  { title: "Unsubscribed from Growth Notes", detail: "12 minutes ago", icon: Check, color: "bg-emerald-100 text-emerald-700" },
  { title: "Connected Gmail account", detail: "Yesterday at 9:42 AM", icon: ShieldCheck, color: "bg-purple-100 text-purple-700" },
  { title: "Removed 8 promotional emails", detail: "Yesterday at 9:18 AM", icon: Sparkles, color: "bg-amber-100 text-amber-700" },
];

function Sidebar({ onClose }: { onClose?: () => void }) {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white px-4 py-5 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40">
      <div className="flex items-center justify-between px-2">
        <Link href="/" className="flex items-center gap-2" onClick={onClose}>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-sm shadow-purple-200">
            <Inbox className="h-5 w-5" />
          </span>
          <span className="text-xl font-bold tracking-tight text-gray-950">Kick<span className="text-primary">Ads</span></span>
        </Link>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden" aria-label="Close navigation">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="mt-9 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Workspace</div>
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

      <div className="mt-8 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Manage</div>
      <nav className="mt-3 space-y-1">
        <Link href="/connect-email" onClick={onClose} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-950">
          <MailPlus className="h-4 w-4" />
          Connect email
        </Link>
        <Link href="/learn/how-data-is-being-used" onClick={onClose} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-950">
          <ShieldCheck className="h-4 w-4" />
          Privacy & data
        </Link>
        <Link href="/learn/how-it-works" onClick={onClose} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-950">
          <CircleHelp className="h-4 w-4" />
          Help center
        </Link>
      </nav>

      <div className="mt-auto rounded-2xl bg-gray-50 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Sparkles className="h-4 w-4 text-primary" />
          Free plan
        </div>
        <p className="mt-2 text-xs leading-5 text-gray-500">You have cleaned 42 of 50 emails this month.</p>
        <Link href="/#pricing" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-purple-800" onClick={onClose}>
          Upgrade plan <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </aside>
  );
}

export function DashboardShell({ email }: DashboardShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [senderFilter, setSenderFilter] = useState("All senders");
  const [showNotifications, setShowNotifications] = useState(false);
//    useEffect(() => {
//     if (!email) return;

//     async function loadGmail() {
//       try {
//         const response = await fetch(`/api/gmail?email=${encodeURIComponent(email)}`);

//         if (!response.ok) {
//           const errorText = await response.text();
//           console.error("Gmail fetch failed:", errorText || "Unknown error");
//           return;
//         }

//         const text = await response.text();
//         const data = text ? JSON.parse(text) : [];
//         console.log(data);
//       } catch (error) {
//         console.error("Failed to parse Gmail response:", error);
//       }
//     }

//     loadGmail();
//   }, [email]);

  return (
    <div className="min-h-screen bg-[#f8f8fb] text-gray-950">
      <div className="flex min-h-screen">
        <div className="hidden lg:block">
          <Sidebar />
        </div>
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <button type="button" className="absolute inset-0 bg-gray-950/30" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />
            <div className="relative z-10 h-full">
              <Sidebar onClose={() => setMobileNavOpen(false)} />
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1 lg:ml-64">
          <header className="flex h-18 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-8">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setMobileNavOpen(true)} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 lg:hidden" aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-400">Workspace</p>
                <p className="text-sm font-semibold text-gray-900">Inbox overview</p>
              </div>
            </div>
            <div className="relative flex items-center gap-2 sm:gap-4">
              <button type="button" onClick={() => setShowNotifications(!showNotifications)} className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label="Notifications">
                <Bell className="h-5 w-5" />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-white" />
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-12 z-20 w-72 rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-lg">
                  <p className="font-semibold text-gray-900">You&apos;re all caught up</p>
                  <p className="mt-1 text-gray-500">No new inbox alerts right now.</p>
                </div>
              )}
              <div className="hidden h-7 w-px bg-gray-200 sm:block" />
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-sm font-semibold text-primary">{email.charAt(0).toUpperCase()}</span>
                <span className="hidden max-w-44 truncate text-sm font-medium text-gray-700 sm:block">{email}</span>
                <ChevronDown className="hidden h-4 w-4 text-gray-400 sm:block" />
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 lg:py-10">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-medium text-primary">Tuesday, September 15, 2026</p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">Good morning.</h1>
                <p className="mt-2 text-gray-600">Here&apos;s a clear view of what&apos;s happening in your inbox.</p>
              </div>
              <Button className="w-fit gap-2 rounded-xl bg-primary px-4 py-2.5 text-white hover:bg-purple-800">
                <Plus className="h-4 w-4" />
                Start cleanup
              </Button>
            </div>

            <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Inbox health" value="84%" detail="Up 12% this month" accent="text-emerald-600" icon={ShieldCheck} />
              <MetricCard label="Emails cleaned" value="42" detail="of 50 on your plan" accent="text-primary" icon={Sparkles} />
              <MetricCard label="Active subscriptions" value="18" detail="3 need your attention" accent="text-amber-600" icon={Inbox} />
              <MetricCard label="Time saved" value="2.4h" detail="estimated this month" accent="text-blue-600" icon={Clock3} />
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-gray-950">Cleanup progress</h2>
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">On track</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">Your inbox is getting quieter every week.</p>
                  </div>
                  <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-purple-800">
                    View report <ArrowUpRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-8 flex items-end gap-6">
                  <div className="relative flex h-40 w-40 shrink-0 items-center justify-center rounded-full" style={{ background: "conic-gradient(#5B21B6 0 84%, #ede9fe 84% 100%)" }}>
                    <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white">
                      <span className="text-3xl font-bold text-gray-950">84%</span>
                      <span className="text-xs text-gray-500">healthy</span>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="space-y-4">
                      <ProgressRow label="Unsubscribed" value="42 emails" percent="72%" color="bg-primary" />
                      <ProgressRow label="Still reviewing" value="18 emails" percent="38%" color="bg-amber-400" />
                      <ProgressRow label="Protected" value="100%" percent="100%" color="bg-emerald-500" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-primary p-6 text-white shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <p className="mt-8 text-sm font-medium text-purple-200">Inbox shield</p>
                <h2 className="mt-2 text-2xl font-bold leading-tight">Your inbox is protected.</h2>
                <p className="mt-3 text-sm leading-6 text-purple-100">KickAds is watching for the patterns that create clutter, so you can stay focused on the messages that matter.</p>
                <Link href="/features/tonight-mode" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-purple-200">
                  Explore shield settings <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-col justify-between gap-4 border-b border-gray-100 p-5 sm:flex-row sm:items-center sm:p-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-950">Subscriptions to review</h2>
                    <p className="mt-1 text-sm text-gray-500">These senders are taking up the most space.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative hidden sm:block">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <input className="h-9 w-36 rounded-lg border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-primary" placeholder="Search" aria-label="Search senders" />
                    </div>
                    <select value={senderFilter} onChange={(event) => setSenderFilter(event.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-600 outline-none focus:border-primary" aria-label="Filter senders">
                      <option>All senders</option>
                      <option>Newsletter</option>
                      <option>Product</option>
                    </select>
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {senders.filter((sender) => senderFilter === "All senders" || sender.category === senderFilter).map((sender) => (
                    <div key={sender.address} className="flex items-center justify-between gap-4 p-5 sm:p-6">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${sender.color}`}>{sender.name.charAt(0)}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{sender.name}</p>
                          <p className="truncate text-xs text-gray-500">{sender.address}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="hidden text-sm text-gray-500 sm:inline">{sender.count} emails</span>
                        <button type="button" className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-primary hover:bg-purple-50">Review</button>
                        <button type="button" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label={`More options for ${sender.name}`}><MoreHorizontal className="h-4 w-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-950">Recent activity</h2>
                    <p className="mt-1 text-sm text-gray-500">A record of your latest actions.</p>
                  </div>
                  <Activity className="h-5 w-5 text-gray-400" />
                </div>
                <div className="mt-6 space-y-5">
                  {activity.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className="flex gap-3">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.color}`}><Icon className="h-4 w-4" /></span>
                        <div>
                          <p className="text-sm font-medium leading-5 text-gray-800">{item.title}</p>
                          <p className="mt-1 text-xs text-gray-500">{item.detail}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Link href="/features/history" className="mt-7 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-purple-800">See all activity <ArrowUpRight className="h-4 w-4" /></Link>
              </div>
            </section>

            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-purple-100 bg-purple-50/70 p-4 text-sm text-purple-900">
              <PanelLeftClose className="h-5 w-5 shrink-0 text-primary" />
              <p><span className="font-semibold">Tip:</span> Start with your top three senders. Small, consistent cleanups make the biggest difference.</p>
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-gray-200 pt-6">
              <div className="flex items-center gap-2 text-xs text-gray-500"><Settings className="h-4 w-4" /> Account settings are coming soon.</div>
              <form action={logout}><Button type="submit" variant="outline" className="border-gray-200 text-gray-600 hover:text-gray-950">Log out</Button></form>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail, accent, icon: Icon }: { label: string; value: string; detail: string; accent: string; icon: typeof ShieldCheck }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <Icon className={`h-5 w-5 ${accent}`} />
      </div>
      <p className="mt-5 text-3xl font-bold tracking-tight text-gray-950">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{detail}</p>
    </div>
  );
}

function ProgressRow({ label, value, percent, color }: { label: string; value: string; percent: string; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">{value}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: percent }} />
      </div>
    </div>
  );
}
