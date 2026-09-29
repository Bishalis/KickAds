"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { UnsubscribeAction } from "@/lib/email/store";
import { formatDate, methodLabels, statusLabels } from "./status";

export function HistoryPanel() {
  const [actions, setActions] = useState<UnsubscribeAction[] | null>(null);
  const [error, setError] = useState("");

  async function request(init?: RequestInit) {
    try {
      const response = await fetch("/api/history", init);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load your history.");
      setError("");
      setActions(data.actions);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load your history.");
      setActions((current) => current ?? []);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/history");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load your history.");
        setActions(data.actions);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load your history.");
        setActions([]);
      }
    }
    void load();
  }, []);

  function markDone(id: string) {
    void request({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">History</h1>
      <p className="mt-2 text-gray-600">Every unsubscribe attempt, how it was made, and what happened.</p>
      {error && <p className="mt-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}

      <section className="mt-8 overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        {actions === null ? (
          <p className="flex items-center justify-center gap-2 p-12 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading history...</p>
        ) : !actions.length ? (
          <p className="p-12 text-center text-sm text-gray-500">No unsubscribe actions yet.</p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Sender</th>
                <th className="px-5 py-3 font-semibold">Method</th>
                <th className="px-5 py-3 font-semibold">Time</th>
                <th className="px-5 py-3 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {actions.map((action) => (
                <tr key={action.id} className="align-top">
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-900">{action.displayName}</p>
                    <p className="text-xs text-gray-500">{action.senderAddress}</p>
                    {action.accountEmail && <p className="mt-1 text-[11px] text-gray-400">In {action.accountEmail}</p>}
                  </td>
                  <td className="px-5 py-4 text-gray-700">{methodLabels[action.method]}</td>
                  <td className="px-5 py-4 text-gray-700">{formatDate(action.createdAt, true)}</td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusLabels[action.status].className}`}>{statusLabels[action.status].label}</span>
                    {action.detail && <p className="mt-2 max-w-sm text-xs text-gray-500">{action.detail}</p>}
                    {action.status === "manual_required" && (
                      <button type="button" onClick={() => markDone(action.id)} className="mt-2 text-xs font-semibold text-primary hover:underline">
                        I&apos;ve unsubscribed. Mark as done
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
