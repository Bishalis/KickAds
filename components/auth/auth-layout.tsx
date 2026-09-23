"use client";

import Link from "next/link";
import { BsEnvelope } from "react-icons/bs";
import { ArrowRight } from "lucide-react";
import { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
  heroTitle?: string;
  heroDescription?: string;
  promoText?: string;
}

export function AuthLayout({
  children,
  heroTitle = "Explore upcoming KickAds features",
  heroDescription = "Connect with KickAds tools, automated email unsubscribes, and shield features to keep your inbox clean with minimal effort.",
  promoText = "Use code KICK20 for 20% off Premium.",
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-white">
      {/* Left Column - Auth Form */}
      <div className="lg:col-span-5 flex flex-col justify-between p-6 sm:p-10 md:p-12 lg:p-14 min-h-screen">
        <div>
          {/* Header Logo */}
          <Link href="/" className="inline-flex items-center gap-2 group mb-8">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white shadow-md shadow-purple-200 group-hover:scale-105 transition-transform">
              <BsEnvelope className="w-5 h-5" />
            </div>
            <span className="text-2xl font-bold text-gray-900 tracking-tight">
              Kick<span className="text-primary">Ads</span>
            </span>
          </Link>

          {/* Form Content */}
          <div className="max-w-md mx-auto w-full">
            {children}
          </div>
        </div>

        {/* Footer info inside form column */}
        <div className="pt-8 text-xs text-gray-400 max-w-md mx-auto w-full">
          <p>© {new Date().getFullYear()} KickAds Inc. All rights reserved.</p>
        </div>
      </div>

      {/* Right Column - Brand / Feature Banner (Matching Screenshot Layout) */}
      <div className="hidden lg:col-span-7 lg:flex relative bg-[#180833] text-white flex-col justify-between p-12 xl:p-16 overflow-hidden">
        {/* Background Graphic Accents */}
        <div className="absolute top-0 right-0 w-full h-full pointer-events-none opacity-20">
          {/* Code Brackets Decorative SVG */}
          <svg className="absolute -top-10 -right-10 w-96 h-96 text-purple-400" viewBox="0 0 200 200" fill="currentColor">
            <path d="M 60 20 C 40 20 30 40 30 60 L 30 80 C 30 95 20 100 10 100 C 20 100 30 105 30 120 L 30 140 C 30 160 40 180 60 180" stroke="currentColor" strokeWidth="12" fill="none" strokeLinecap="round" />
            <path d="M 140 20 C 160 20 170 40 170 60 L 170 80 C 170 95 180 100 190 100 C 180 100 170 105 170 120 L 170 140 C 170 160 160 180 140 180" stroke="currentColor" strokeWidth="12" fill="none" strokeLinecap="round" />
          </svg>

          {/* Wave / Flow Shapes */}
          <svg className="absolute bottom-0 left-0 w-full h-2/3 text-purple-900/40" viewBox="0 0 500 500" preserveAspectRatio="none" fill="currentColor">
            <path d="M0,100 C150,200 350,0 500,100 L500,500 L0,500 Z" />
          </svg>

          {/* Star / Asterisk Graphic in Bottom Right */}
          <svg className="absolute -bottom-16 -right-16 w-80 h-80 text-purple-600/30 animate-spin-slow" viewBox="0 0 100 100" fill="currentColor">
            <path d="M50 0 L55 35 L90 20 L65 50 L90 80 L55 65 L50 100 L45 65 L10 80 L35 50 L10 20 L45 35 Z" />
          </svg>
        </div>

        {/* Top Tag */}
        <div className="relative z-10">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-900/60 border border-purple-500/30 text-xs font-semibold text-purple-200 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            KickAds Platform
          </span>
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-xl space-y-6 my-auto py-12">
          <h2 className="text-3xl lg:text-4xl xl:text-5xl font-extrabold tracking-tight text-white leading-[1.18]">
            {heroTitle}
          </h2>

          <p className="text-lg text-purple-200/90 leading-relaxed font-normal">
            {heroDescription}
          </p>

          {promoText && (
            <div className="inline-block px-4 py-2.5 rounded-xl bg-purple-900/40 border border-purple-500/20 text-sm font-medium text-purple-100">
              {promoText}
            </div>
          )}

          <div className="pt-2">
            <Link
              href="/#what-we-do"
              className="inline-flex items-center gap-2 text-base font-semibold text-white hover:text-purple-300 transition-colors border-b-2 border-white/40 pb-1 hover:border-purple-300"
            >
              Browse features <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Bottom Quote / Badge */}
        <div className="relative z-10 pt-6 border-t border-purple-800/40 flex items-center justify-between text-xs text-purple-300/80">
          <span>Trusted by 10,000+ users worldwide</span>
          <span>100% Secure & Private</span>
        </div>
      </div>
    </div>
  );
}