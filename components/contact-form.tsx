"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateContact, type ContactErrors, type ContactInput } from "@/lib/contact";

export function ContactForm({ defaultEmail = "" }: { defaultEmail?: string }) {
  const [values, setValues] = useState<ContactInput>({ name: "", email: defaultEmail, message: "" });
  const [errors, setErrors] = useState<ContactErrors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [submitError, setSubmitError] = useState("");
  const [startedAt] = useState(() => Date.now());

  function update(field: keyof ContactInput, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    const result = validateContact(values);
    setErrors(result.errors);
    if (Object.keys(result.errors).length) return;

    setStatus("sending");
    try {
      const website = new FormData(event.currentTarget).get("website");
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result.values, website, startedAt }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.fieldErrors) setErrors(data.fieldErrors);
        throw new Error(data.error ?? "We couldn't send your message.");
      }
      setStatus("sent");
    } catch (sendError) {
      setSubmitError(sendError instanceof Error ? sendError.message : "We couldn't send your message.");
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900" role="status">
        <CheckCircle2 className="h-6 w-6 text-emerald-600" />
        <p className="mt-3 font-semibold">Thanks, your message was sent.</p>
        <p className="mt-1 text-sm">We&apos;ll reply to {values.email} as soon as we can.</p>
      </div>
    );
  }

  const field = (name: keyof ContactInput) => ({
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-xs font-semibold text-gray-700">Name</label>
        <Input id="name" value={values.name} onChange={(event) => update("name", event.target.value)} autoComplete="name" maxLength={100} className="h-10 rounded-lg border-gray-300" {...field("name")} />
        {errors.name && <p id="name-error" className="text-xs text-red-600">{errors.name}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-xs font-semibold text-gray-700">Email</label>
        <Input id="email" type="email" value={values.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" maxLength={320} className="h-10 rounded-lg border-gray-300" {...field("email")} />
        {errors.email && <p id="email-error" className="text-xs text-red-600">{errors.email}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="message" className="text-xs font-semibold text-gray-700">Message</label>
        <textarea
          id="message"
          value={values.message}
          onChange={(event) => update("message", event.target.value)}
          rows={6}
          maxLength={5000}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
          {...field("message")}
        />
        {errors.message && <p id="message-error" className="text-xs text-red-600">{errors.message}</p>}
      </div>
      {/* Hidden from people; bots that fill every field reveal themselves here. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      {submitError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{submitError}</p>}
      <Button type="submit" disabled={status === "sending"} className="mt-1 h-11 gap-2 rounded-lg bg-primary font-medium text-white hover:bg-purple-800">
        {status === "sending" ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</> : "Send message"}
      </Button>
    </form>
  );
}
