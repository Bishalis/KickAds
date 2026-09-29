"use client";

import { useActionState } from "react";
import { updatePassword, type AuthState } from "@/app/actions/auth";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function UpdatePasswordPage() {
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(updatePassword, {});

  return (
    <AuthLayout>
      <div className="flex w-full flex-col gap-6">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Choose a new password</h1>
        <form className="flex flex-col gap-4" action={formAction}>
          {state.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{state.error}</p>}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-semibold text-gray-700">New password</label>
            <Input id="password" name="password" type="password" required autoComplete="new-password" className="h-10 w-full rounded-lg border-gray-300" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmPassword" className="text-xs font-semibold text-gray-700">Confirm new password</label>
            <Input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" className="h-10 w-full rounded-lg border-gray-300" />
          </div>
          <Button type="submit" disabled={isPending} className="mt-2 h-11 w-full rounded-lg bg-primary font-medium text-white hover:bg-purple-800">
            {isPending ? "Saving..." : "Save password"}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
