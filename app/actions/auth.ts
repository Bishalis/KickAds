"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { gmailTokenCookie } from "@/lib/email/google-oauth";

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

  const username = formData.get("username");
  const email = formData.get("email");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (
    typeof username !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof confirmPassword !== "string" ||
    !username ||
    !email ||
    !password ||
    !confirmPassword
  ) {
    return { error: "Complete all fields to create your account." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
      data: {
        username,
        email,
      },
    },
  });

  if (error) {
    return {
      error: error.message,
      username,
      email,
    };
  }

  if (!data.session) {
    return {
      message: "Check your email to confirm your account, then sign in.",
    };
  }

  redirect("/auth/login");
}

export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
  const cookieStore = await cookies();
  cookieStore.delete(gmailTokenCookie);
  redirect("/");
}
