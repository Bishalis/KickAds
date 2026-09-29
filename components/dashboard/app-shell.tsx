"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CircleHelp, Clock3, Inbox, LayoutDashboard, MailPlus, Menu, ShieldCheck, X } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { PlanCard } from "./plan-card";
import { clearScanSnapshot } from "./scan-cache";

const workspaceItems = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Subscriptions", href: "/dashboard/unsubscriber", icon: Inbox },
  { label: "History", href: "/dashboard/history", icon: Clock3 },
];

const manageItems = [
  { label: "Connect email", href: "/connect-email", icon: MailPlus },
  { label: "Privacy & data", href: "/dashboard/privacy", icon: ShieldCheck },
  { label: "Help center", href: "/dashboard/help", icon: CircleHelp },
];

function NavLink({ item, active, onClick }: { item: (typeof workspaceItems)[number]; active: boolean; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-purple-50 text-primary" : "text-gray-600 hover:bg-gray-50 hover:text-gray-950"}`}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white px-4 py-5 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40">
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
        {workspaceItems.map((item) => <NavLink key={item.href} item={item} active={pathname === item.href} onClick={onClose} />)}
      </nav>

      <div className="mt-8 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Manage</div>
      <nav className="mt-3 space-y-1">
        {manageItems.map((item) => <NavLink key={item.href} item={item} active={pathname === item.href} onClick={onClose} />)}
      </nav>

      <div className="mt-auto space-y-3 pt-6">
        <PlanCard onNavigate={onClose} />
        <form action={logout} onSubmit={clearScanSnapshot} className="px-2">
          <Button type="submit" variant="outline" className="w-full border-gray-200 text-gray-600 hover:text-gray-950">Log out</Button>
        </form>
      </div>
    </aside>
  );
}

export function AppShell({ email, children }: { email: string; children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  const title = [...workspaceItems, ...manageItems, { label: "Plans", href: "/dashboard/upgrade" }].find((item) => item.href === pathname)?.label ?? "Workspace";

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
                <p className="text-sm font-semibold text-gray-900">{title}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-sm font-semibold text-primary">{email.charAt(0).toUpperCase()}</span>
              <span className="hidden max-w-56 truncate text-sm font-medium text-gray-700 sm:block">{email}</span>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:py-10">{children}</main>
        </div>
      </div>
    </div>
  );
}
