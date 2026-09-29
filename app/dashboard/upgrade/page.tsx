import { Check, Crown, Sparkles } from "lucide-react";
import { getAuthedContext, getPlanUsage } from "@/lib/email/store";
import { planLimits, type Plan } from "@/lib/plans";
import { redirect } from "next/navigation";

const features: Record<Plan, string[]> = {
  free: [
    `${planLimits.free.monthlyUnsubscribes} unsubscribes per month`,
    `Scans your newest ${planLimits.free.maxScanMessages?.toLocaleString("en")} emails`,
    `${planLimits.free.maxAccounts} Gmail account`,
    "Protect, ignore, and review senders",
    "Unsubscribe history",
  ],
  premium: [
    "Unlimited unsubscribes",
    "Scans every email from the last 6 months",
    `Up to ${planLimits.premium.maxAccounts} Gmail accounts`,
    "Protect, ignore, and review senders",
    "Unsubscribe history",
  ],
};

export default async function UpgradePage() {
  const context = await getAuthedContext();
  if (!context) redirect("/auth/login");
  const usage = await getPlanUsage(context).catch(() => null);
  const current = usage?.plan ?? "free";

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">Plans</h1>
      <p className="mt-2 text-gray-600">
        You&apos;re on <span className="font-semibold text-gray-900">{planLimits[current].label}</span>
        {usage && current === "free" ? ` and have used ${usage.unsubscribesThisMonth} of ${planLimits.free.monthlyUnsubscribes} unsubscribes this month.` : "."}
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {(["free", "premium"] as const).map((plan) => {
          const isCurrent = plan === current;
          const Icon = plan === "premium" ? Crown : Sparkles;
          return (
            <section key={plan} className={`rounded-2xl border bg-white p-6 shadow-sm ${plan === "premium" ? "border-primary" : "border-gray-200"}`}>
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-xl font-bold text-gray-950"><Icon className="h-5 w-5 text-primary" /> {planLimits[plan].label}</h2>
                {isCurrent && <span className="rounded-full bg-purple-50 px-2 py-1 text-[11px] font-semibold text-primary">Current plan</span>}
              </div>
              <ul className="mt-5 space-y-2 text-sm text-gray-700">
                {features[plan].map((feature) => (
                  <li key={feature} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {feature}</li>
                ))}
              </ul>
              {plan === "premium" && !isCurrent && (
                <div className="mt-6">
                  <button type="button" disabled className="h-11 w-full cursor-not-allowed rounded-xl bg-primary text-sm font-semibold text-white opacity-60">
                    Online checkout coming soon
                  </button>
                  <p className="mt-2 text-xs text-gray-500">During early access, Premium is enabled by the KickAds team.</p>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
