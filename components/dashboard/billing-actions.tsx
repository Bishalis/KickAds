"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { planUsageChangedEvent, premiumPriceLabel, type PlanUsage } from "@/lib/plans";
import { formatDate } from "./status";

const buttonClass = "flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-60";

/** Redirects to a Stripe-hosted page (checkout or billing portal) created by the server. */
async function openStripe(path: string) {
  const response = await fetch(path, { method: "POST" });
  const data = await response.json();
  if (!response.ok || !data.url) throw new Error(data.error ?? "Something went wrong. Please try again.");
  window.location.assign(data.url);
}

export function BillingActions({ usage }: { usage: PlanUsage }) {
  const router = useRouter();
  const checkout = useSearchParams().get("checkout");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [activation, setActivation] = useState<"waiting" | "active" | "slow" | null>(checkout === "success" && usage.plan !== "premium" ? "waiting" : null);

  // Returning from Stripe proves nothing by itself; wait until the webhook has upgraded the plan.
  useEffect(() => {
    if (activation !== "waiting") return;
    const started = Date.now();
    const timer = setInterval(async () => {
      const response = await fetch("/api/plan").catch(() => null);
      const latest = response?.ok ? (await response.json()) as PlanUsage : null;
      if (latest?.plan === "premium") {
        clearInterval(timer);
        setActivation("active");
        window.dispatchEvent(new Event(planUsageChangedEvent));
        router.refresh();
      } else if (Date.now() - started > 60_000) {
        clearInterval(timer);
        setActivation("slow");
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [activation, router]);

  async function go(path: string) {
    setPending(true);
    setError("");
    try {
      await openStripe(path);
    } catch (stripeError) {
      setError(stripeError instanceof Error ? stripeError.message : "Something went wrong. Please try again.");
      setPending(false);
    }
  }

  const { billing } = usage;
  return (
    <div className="mt-6 space-y-3">
      {activation === "waiting" && (
        <p className="flex items-center gap-2 rounded-lg bg-purple-50 p-3 text-sm text-purple-900" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Payment received. Activating Premium...
        </p>
      )}
      {activation === "active" && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" role="status">Premium is active. Thank you!</p>}
      {activation === "slow" && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status">
          Your payment is being confirmed. Premium will switch on within a few minutes; refresh this page to check.
        </p>
      )}
      {checkout === "cancelled" && <p className="rounded-lg bg-gray-100 p-3 text-sm text-gray-700">Checkout was cancelled. You haven&apos;t been charged.</p>}
      {billing.subscriptionStatus === "past_due" && (
        <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800" role="alert">
          Your last payment failed. Update your card to keep Premium; Stripe will retry the payment automatically.
        </p>
      )}
      {usage.plan === "premium" && billing.cancelAtPeriodEnd && billing.currentPeriodEnd && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Premium is cancelled and ends on {formatDate(billing.currentPeriodEnd)}.</p>
      )}

      {usage.plan === "free" && activation !== "waiting" && (
        <button type="button" onClick={() => go("/api/billing/checkout")} disabled={pending} className={buttonClass}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Upgrade to Premium · {premiumPriceLabel}
        </button>
      )}
      {billing.hasBillingAccount && (usage.plan === "premium" || billing.subscriptionStatus) && (
        <button type="button" onClick={() => go("/api/billing/portal")} disabled={pending} className={`${buttonClass} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}>
          Manage billing
        </button>
      )}
      {usage.plan === "premium" && !billing.hasBillingAccount && (
        <p className="text-xs text-gray-500">Premium was enabled for your account by the KickAds team.</p>
      )}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <p className="text-xs text-gray-500">Payments are handled securely by Stripe. KickAds never sees your card details.</p>
    </div>
  );
}
