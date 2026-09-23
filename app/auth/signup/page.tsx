"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BsEye, BsEyeSlash, BsExclamationTriangleFill, BsCheckCircleFill } from "react-icons/bs";
import { useState } from "react";
import Link from "next/link";
import { signup, type AuthState } from "@/app/actions/auth";
import { useActionState } from "react";
import { SocialAuthButtons } from "@/components/auth/social-auth-buttons";
import { AuthLayout } from "@/components/auth/auth-layout";

export default function SignUpPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(signup, {});

  return (
    <AuthLayout
      heroTitle="Join thousands cleaning their inboxes effortlessly"
      heroDescription="Get instant access to automated email unsubscribe features, custom rollup summaries, and continuous inbox shield protection."
      promoText="Free 14-day trial included."
    >
      <div className="flex flex-col gap-6 w-full">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Create an account
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Already have an account?{" "}
            <Link
              href="/auth/login"
              className="font-semibold text-primary hover:underline"
            >
              Log In
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
          {state.error && (
            <div className="flex gap-3 p-3.5 bg-red-50 border-l-4 border-red-500 rounded-r-lg text-red-800 text-xs font-medium">
              <BsExclamationTriangleFill className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <span>{state.error}</span>
            </div>
          )}

          {state.message && (
            <div className="flex gap-3 p-3.5 bg-emerald-50 border-l-4 border-emerald-500 rounded-r-lg text-emerald-800 text-xs font-medium">
              <BsCheckCircleFill className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <span>{state.message}</span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" className="text-xs font-semibold text-gray-700">
              Full Name
            </label>
            <Input
              id="username"
              name="username"
              placeholder="John Doe"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full h-10 border-gray-300 focus:border-primary focus:ring-primary rounded-lg"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-semibold text-gray-700">
              Email Address
            </label>
            <Input
              id="email"
              name="email"
              placeholder="name@company.com"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 border-gray-300 focus:border-primary focus:ring-primary rounded-lg"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-semibold text-gray-700">
              Password
            </label>
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

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmPassword" className="text-xs font-semibold text-gray-700">
              Confirm Password
            </label>
            <div className="relative">
              <Input
                id="confirmPassword"
                placeholder="••••••••"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                className="w-full h-10 border-gray-300 focus:border-primary focus:ring-primary rounded-lg pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
              >
                {showConfirmPassword ? (
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
            {isPending ? "Creating account..." : "Sign Up"}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
