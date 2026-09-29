"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Crown, Sparkles } from "lucide-react";
import { planUsageChangedEvent, type PlanUsage } from "@/lib/plans";

export function PlanCard({ onNavigate }: { onNavigate?: () => void }) {
  const [usage, setUsage] = useState<PlanUsage | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/plan");
        if (response.ok) setUsage(await response.json());
      } catch {
        // The card is informational; the server enforces limits either way.
      }
    }
    void load();
    window.addEventListener(planUsageChangedEvent, load);
    return () => window.removeEventListener(planUsageChangedEvent, load);
  }, []);

  if (!usage) return <div className="h-32 rounded-2xl bg-gray-50" aria-hidden="true" />;

  if (usage.plan === "premium") {
    return (
      <div className="rounded-2xl bg-purple-50 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Crown className="h-4 w-4 text-primary" /> Premium plan
        </div>
        <p className="mt-2 text-xs leading-5 text-gray-600">
          Unlimited unsubscribes, full inbox scans, and {usage.accountsConnected} of {usage.limits.maxAccounts} Gmail accounts connected.
        </p>
      </div>
    );
  }

  const limit = usage.limits.monthlyUnsubscribes ?? 0;
  const used = Math.min(usage.unsubscribesThisMonth, limit);
  return (
    <div className="rounded-2xl bg-gray-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Sparkles className="h-4 w-4 text-primary" /> {usage.limits.label} plan
      </div>
      <p className="mt-2 text-xs leading-5 text-gray-500">{used} of {limit} unsubscribes used this month.</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
        <div className={`h-full rounded-full ${used >= limit ? "bg-rose-500" : "bg-primary"}`} style={{ width: `${limit ? (used / limit) * 100 : 0}%` }} />
      </div>
      <Link href="/dashboard/upgrade" onClick={onNavigate} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-purple-800">
        Upgrade plan <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
