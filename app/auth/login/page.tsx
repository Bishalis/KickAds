"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BsEye, BsEyeSlash, BsExclamationTriangleFill } from "react-icons/bs";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { login, type AuthState } from "@/app/actions/auth";
import { useActionState } from "react";
import { SocialAuthButtons } from "@/components/auth/social-auth-buttons";
import { AuthLayout } from "@/components/auth/auth-layout";

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}

function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const searchParams = useSearchParams();
  const callbackMessage = searchParams.get("message");
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(login, {});

  return (
    <AuthLayout
      heroTitle="Explore upcoming KickAds.local features"
      heroDescription="Connect with email security experts and AI inbox managers. Get the skills and tools you need to keep your inbox clean for a new generation of productivity."
      promoText="Use KICK50 for 50% off."
    >
      <div className="flex flex-col gap-6 w-full">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Log in to your account
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Don&apos;t have an account?{" "}
            <Link
              href="/auth/signup"
              className="font-semibold text-primary hover:underline"
            >
              Sign Up
            </Link>
          </p>
        </div>

        <SocialAuthButtons />

        <div className="relative flex items-center justify-center my-1">
          <div className="border-t border-gray-200 w-full" />
          <span className="bg-white px-3 text-xs text-gray-400 uppercase tracking-wider whitespace-nowrap absolute">
            Or with email and password
          </span>
        </div>

        <form className="flex flex-col gap-4 mt-2" action={formAction}>
          {(state.error || callbackMessage) && (
            <div className="flex gap-3 p-3.5 bg-red-50 border-l-4 border-red-500 rounded-r-lg text-red-800 text-xs font-medium">
              <BsExclamationTriangleFill className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <span>{state.error ?? callbackMessage}</span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-semibold text-gray-700">
              Email Address
            </label>
            <Input
              id="email"
              name="email"
              placeholder="name@company.com"
              type="email"
              className="w-full h-10 border-gray-300 focus:border-primary focus:ring-primary rounded-lg"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-xs font-semibold text-gray-700">
                Password
              </label>
              <Link
                href="/reset-password"
                className="text-xs font-medium text-primary hover:underline"
              >
                Reset password?
              </Link>
            </div>

            <div className="relative">
              <Input
                id="password"
                placeholder="••••••••"
                name="password"
                type={showPassword ? "text" : "password"}
                className="w-full h-10 border-gray-300 focus:border-primary focus:ring-primary rounded-lg pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
              >
                {showPassword ? (
                  <BsEyeSlash className="w-5 h-5" />
                ) : (
                  <BsEye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-11 bg-primary hover:bg-purple-800 text-white font-medium rounded-lg shadow-sm transition-colors mt-2 cursor-pointer"
            disabled={isPending}
          >
            {isPending ? "Logging in..." : "Log In"}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
