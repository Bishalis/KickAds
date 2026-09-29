import type { UnsubscribeStatus } from "@/lib/email/store";
import type { UnsubscribeMethod } from "@/lib/email/unsubscribe";

export const statusLabels: Record<UnsubscribeStatus, { label: string; className: string }> = {
  success: { label: "Successful", className: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Failed", className: "bg-rose-100 text-rose-800" },
  manual_required: { label: "Needs your action", className: "bg-amber-100 text-amber-800" },
  no_method: { label: "No unsubscribe method", className: "bg-gray-100 text-gray-600" },
  pending: { label: "Pending", className: "bg-blue-100 text-blue-800" },
};

export const methodLabels: Record<UnsubscribeMethod, string> = {
  one_click: "One-click",
  https: "Web page",
  mailto: "Email request",
  body_link: "Link in email",
  none: "None found",
};

export function formatDate(value: string, withTime = false) {
  return new Intl.DateTimeFormat("en", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(value));
}
