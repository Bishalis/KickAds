"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft, Check, Inbox, LockKeyhole, Mail, Plus, ShieldCheck, Unplug } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { useSearchParams } from "next/navigation";

export default function ConnectEmailPage() {
  return <Suspense fallback={null}><ConnectEmailContent /></Suspense>;
}

function ConnectEmailContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const connected = searchParams.get("connected") === "true";
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);

  useEffect(() => {
    async function loadConnection() {
      try {
        const response = await fetch("/api/gmail/status");
        const data = await response.json();
        if (response.ok) setConnectedEmail(data.gmailConnected ? data.email : null);
      } finally {
        setIsCheckingConnection(false);
      }
    }

    void loadConnection();
  }, []);

  async function disconnectEmail() {
    const response = await fetch("/api/gmail/disconnect", { method: "POST" });
    if (response.ok) setConnectedEmail(null);
  }

  return (
    <main className="min-h-screen bg-[#f8f8fb] px-4 py-8 text-gray-950 sm:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-primary">
          <ArrowLeft className="h-4 w-4" />
          Back to overview
        </Link>

        <div className="mt-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
            <section className="bg-primary px-6 py-8 text-white sm:px-10 sm:py-12">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
                <Inbox className="h-6 w-6" />
              </div>
              <p className="mt-10 text-sm font-semibold uppercase tracking-[0.16em] text-purple-200">KickAds workspace</p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Bring your inbox back under control.</h1>
              <p className="mt-4 max-w-md leading-7 text-purple-100">Connect your email to find subscriptions, organize noisy senders, and make cleanup feel effortless.</p>
              <div className="mt-10 space-y-4 text-sm text-purple-100">
                <div className="flex items-center gap-3"><Check className="h-4 w-4 text-purple-200" />Find newsletters and promotional mail</div>
                <div className="flex items-center gap-3"><Check className="h-4 w-4 text-purple-200" />Keep your inbox data private</div>
                <div className="flex items-center gap-3"><Check className="h-4 w-4 text-purple-200" />Disconnect whenever you choose</div>
              </div>
            </section>

            <section className="px-6 py-8 sm:px-10 sm:py-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-primary">
                <Mail className="h-6 w-6" />
              </div>
              <h2 className="mt-6 text-2xl font-bold tracking-tight">Connect an email account</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">Connect Gmail separately from sign-in. You choose which Google account to use and approve read-only inbox access.</p>

              {connectedEmail ? (
                <div className="mt-8 space-y-3">
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-rose-100 bg-rose-50/40 p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm"><FcGoogle size={22} /></span>
                      <div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Connected Gmail</p><p className="truncate text-sm font-semibold text-gray-900">{connectedEmail}</p></div>
                    </div>
                    <button type="button" onClick={disconnectEmail} className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"><Unplug className="mr-1.5 inline h-4 w-4" />Disconnect</button>
                  </div>
                  <a href="/api/gmail/connect" className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"><Plus className="h-4 w-4" />Add another email</a>
                </div>
              ) : (
                <a href="/api/gmail/connect" className="mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"><FcGoogle size={22} />Connect Gmail</a>
              )}

              {connected && <p className="mt-3 text-sm text-emerald-700" role="status">Gmail connected. Your inbox is ready to review.</p>}
              {!connectedEmail && isCheckingConnection && <p className="mt-3 text-sm text-gray-500">Checking connected accounts...</p>}
              {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <LockKeyhole className="h-5 w-5 text-primary" />
                  <p className="mt-3 text-sm font-semibold">Read-only access</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">We do not send, edit, or delete messages without your action.</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <p className="mt-3 text-sm font-semibold">Your choice</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">Manage access from your Google account at any time.</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
