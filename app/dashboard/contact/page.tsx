import { ContactForm } from "@/components/contact-form";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardContactPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">Contact us</h1>
      <p className="mt-2 text-gray-600">Questions, feedback, or trouble with your account? We&apos;ll reply by email.</p>
      <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <ContactForm defaultEmail={user?.email ?? ""} />
      </div>
    </div>
  );
}
