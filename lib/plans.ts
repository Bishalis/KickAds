export type Plan = "free" | "premium";

export type PlanLimits = {
  label: string;
  /** Unsubscribes per calendar month (UTC); null means unlimited. */
  monthlyUnsubscribes: number | null;
  /** Emails analyzed per scan; null means every email in the scan window. */
  maxScanMessages: number | null;
  maxAccounts: number;
};

export const planLimits: Record<Plan, PlanLimits> = {
  free: { label: "Freemium", monthlyUnsubscribes: 10, maxScanMessages: 1500, maxAccounts: 1 },
  premium: { label: "Premium", monthlyUnsubscribes: null, maxScanMessages: null, maxAccounts: 3 },
};

export function startOfUtcMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export type PlanUsage = {
  plan: Plan;
  limits: PlanLimits;
  unsubscribesThisMonth: number;
  accountsConnected: number;
};

/** Browser-side signal that plan usage changed, so the plan widget refetches. */
export const planUsageChangedEvent = "kickads:plan-usage-changed";

/** The requested action isn't included in the user's plan. */
export class PlanLimitError extends Error {}
