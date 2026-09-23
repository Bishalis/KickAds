import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { LandingPageContent } from "@/lib/landing-content";

interface DetailPageProps {
  content: LandingPageContent;
  backHref: string;
  nextHref?: string;
  nextLabel?: string;
}

export function DetailPage({ content, backHref, nextHref, nextLabel }: DetailPageProps) {
  const Icon = content.icon;

  return (
    <main className="flex-1">
      <section className="border-b border-gray-100 bg-gray-50/70">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-8 md:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <Link href={backHref} className="mb-10 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-primary">
              <ArrowLeft className="h-4 w-4" />
              Back to KickAds
            </Link>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-primary">{content.eyebrow}</p>
            <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight text-gray-950 sm:text-5xl lg:text-6xl">
              {content.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-600">{content.description}</p>
            <Link href="/auth/signup" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-medium text-white transition-colors hover:bg-purple-800">
              Start with KickAds
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className={`relative min-h-80 overflow-hidden rounded-3xl bg-linear-to-br ${content.accent} p-8 text-white shadow-xl shadow-purple-200/50 sm:p-10`}>
            <div className="absolute -right-12 -top-16 h-56 w-56 rounded-full border-28 border-white/10" />
            <div className="absolute -bottom-24 -left-10 h-64 w-64 rounded-full border-34 border-white/10" />
            <div className="relative flex h-full min-h-64 flex-col justify-between">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
                <Icon className="h-7 w-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-white/70">KickAds / {content.eyebrow}</p>
                <p className="mt-2 max-w-sm text-2xl font-semibold leading-snug">A more considered way to manage email.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-8 md:py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">What you get</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">Simple tools, useful outcomes.</h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {content.highlights.map((highlight) => (
            <article key={highlight.title} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-50 text-primary">
                <Check className="h-4 w-4" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-gray-950">{highlight.title}</h3>
              <p className="mt-2 leading-7 text-gray-600">{highlight.description}</p>
            </article>
          ))}
        </div>
        {nextHref && nextLabel && (
          <div className="mt-12 border-t border-gray-200 pt-8">
            <Link href={nextHref} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-purple-800">
              Next: {nextLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
