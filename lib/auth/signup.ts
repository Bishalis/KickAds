export type SignupResult =
  | { error: string; username?: string; email?: string }
  | { message: string }
  | { redirectTo: string };

type SignUpParams = {
  email: string;
  password: string;
  options: { emailRedirectTo: string; data: { username: string; email: string } };
};

/** Supabase's auth.signUp, passed in so tests can use a fake instead of a real project. */
export type SignUp = (params: SignUpParams) => Promise<{ data: { session: unknown }; error: { message: string } | null }>;

/**
 * Validates the signup form and creates the account. Returns what the page should show,
 * or where to redirect; the server action does the actual redirect.
 */
export async function signupUser(signUp: SignUp, formData: FormData, siteUrl: string): Promise<SignupResult> {
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

  const { data, error } = await signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
      data: { username, email },
    },
  });

  if (error) {
    // Keep what the user typed (but never the password) so the form can be refilled.
    return { error: error.message, username, email };
  }

  if (!data.session) {
    return { message: "Check your email to confirm your account, then sign in." };
  }

  return { redirectTo: "/auth/login" };
}
