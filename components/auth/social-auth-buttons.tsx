"use client";

import { useState } from "react";
import Image from "next/image";
import { FcGoogle } from "react-icons/fc";
import microsoftIcon from "@/public/microsoft-icon.svg";

import { createClient } from "@/lib/supabase/client";

type Provider = "google" | "azure";

export function SocialAuthButtons() {
  const [error, setError] = useState<string>();
  const [isPending, setIsPending] = useState<Provider>();

  async function signInWithProvider(provider: Provider) {
    setError(undefined);
    setIsPending(provider);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (authError) {
      setError(authError.message);
      setIsPending(undefined);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => signInWithProvider("google")}
        disabled={Boolean(isPending)}
        className="flex h-11 items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white font-medium text-gray-700 shadow-xs hover:bg-gray-50 transition-colors disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
      >
        <FcGoogle size={22} />
        <span>{isPending === "google" ? "Connecting..." : "Google"}</span>
      </button>
      <button
        type="button"
        onClick={() => signInWithProvider("azure")}
        disabled={Boolean(isPending)}
        className="flex h-11 items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white font-medium text-gray-700 shadow-xs hover:bg-gray-50 transition-colors disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
      >
        <Image src={microsoftIcon} alt="" className="h-5 w-5" />
        <span>{isPending === "azure" ? "Connecting..." : "Microsoft"}</span>
      </button>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}