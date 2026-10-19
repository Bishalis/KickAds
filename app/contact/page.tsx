import { ContactForm } from "@/components/contact-form";
import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";

export const metadata = { title: "Contact | KickAds" };

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-gray-900">
      <Header />
      <main className="flex-1 px-4 py-16 sm:px-8 md:py-24">
        <div className="mx-auto max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Contact</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-950">Get in touch</h1>
          <p className="mt-3 text-gray-600">Questions, feedback, or trouble with your account? Send us a message and we&apos;ll reply by email.</p>
          <div className="mt-8"><ContactForm /></div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
