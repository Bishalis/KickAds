"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signupUser } from "@/lib/auth/signup";

export type AuthState = {
  error?: string;
  message?: string;
  username?: string;
  email?: string;
};

export async function login(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const supabase = await createClient();

  const email = formData.get("email");
  const password = formData.get("password");

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email ||
    !password
  ) {
    return { error: "Enter your email and password." };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export async function signup(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const supabase = await createClient();
  const result = await signupUser(
    (params) => supabase.auth.signUp(params),
    formData,
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  );
  if ("redirectTo" in result) redirect(result.redirectTo);
  return result;
}

export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
  redirect("/");
}

export async function requestPasswordReset(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = formData.get("email");
  if (typeof email !== "string" || !email) {
    return { error: "Enter your email address." };
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/auth/update-password`,
  });
  if (error) console.error("Password reset request failed:", error.message);

  // Same answer whether or not the account exists, so this can't be used to probe emails.
  return { message: "If an account exists for that email, a reset link is on its way." };
}

export async function updatePassword(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");
  if (typeof password !== "string" || typeof confirmPassword !== "string" || !password) {
    return { error: "Enter a new password." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your reset link has expired. Request a new one." };
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message };
  }
  redirect("/dashboard");
}
