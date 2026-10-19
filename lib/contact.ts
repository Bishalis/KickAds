export type ContactInput = { name: string; email: string; message: string };
export type ContactErrors = Partial<Record<keyof ContactInput, string>>;

const emailPattern = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

/** Shared by the form (instant feedback) and the API (the check that counts). */
export function validateContact(input: Partial<Record<keyof ContactInput, unknown>>): { values: ContactInput; errors: ContactErrors } {
  const values = {
    name: typeof input.name === "string" ? input.name.trim() : "",
    email: typeof input.email === "string" ? input.email.trim() : "",
    message: typeof input.message === "string" ? input.message.trim() : "",
  };
  const errors: ContactErrors = {};
  if (!values.name) errors.name = "Enter your name.";
  else if (values.name.length > 100) errors.name = "Keep your name under 100 characters.";
  if (!values.email) errors.email = "Enter your email address.";
  else if (values.email.length > 320 || !emailPattern.test(values.email)) errors.email = "Enter a valid email address.";
  if (!values.message) errors.message = "Enter a message.";
  else if (values.message.length < 10) errors.message = "Tell us a little more (at least 10 characters).";
  else if (values.message.length > 5000) errors.message = "Keep your message under 5,000 characters.";
  return { values, errors };
}

/** Submissions faster than this after the form appeared are almost always bots. */
export const minimumFillTimeMs = 3000;
