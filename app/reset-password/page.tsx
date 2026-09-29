"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type AuthState } from "@/app/actions/auth";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(requestPasswordReset, {});

  return (
    <AuthLayout>
      <div className="flex w-full flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Reset your password</h1>
          <p className="mt-2 text-sm text-gray-600">
            Remembered it?{" "}
            <Link href="/auth/login" className="font-semibold text-primary hover:underline">Log in</Link>
          </p>
        </div>
        <form className="flex flex-col gap-4" action={formAction}>
          {state.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{state.error}</p>}
          {state.message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{state.message}</p>}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-semibold text-gray-700">Email Address</label>
            <Input id="email" name="email" type="email" required placeholder="name@company.com" className="h-10 w-full rounded-lg border-gray-300" />
          </div>
          <Button type="submit" disabled={isPending} className="mt-2 h-11 w-full rounded-lg bg-primary font-medium text-white hover:bg-purple-800">
            {isPending ? "Sending..." : "Send reset link"}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
