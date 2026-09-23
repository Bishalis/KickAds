import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BsCheckCircleFill } from "react-icons/bs";
import { ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12 md:py-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        {/* Left Column - Copy */}
        <div className="flex flex-col items-start gap-6">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 leading-[1.15]">
            Hey Human, do you want to unsubscribe emails?
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed max-w-xl">
            Kick-Ads helps you easily unsubscribe from unwanted emails, keeping your inbox clean and organized.
          </p>
          <div className="pt-2">
            <Link href="/auth/signup">
              <Button className="h-12 btn-primary bg-primary hover:bg-purple-800 text-white text-base px-8 py-6 rounded-xl shadow-lg shadow-purple-200 transition-all hover:scale-[1.02] flex items-center gap-2">
                Remove it right now
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Right Column - Illustration / Interactive Graphic */}
        <div className="relative flex justify-center items-center">
          <div className="relative w-full max-w-lg bg-linear-to-br from-purple-50/80 to-indigo-50/50 rounded-3xl p-6 sm:p-10 border border-purple-100/60 shadow-xl shadow-purple-100/50">
            {/* SVG Illustration Representation */}
            <div className="relative flex justify-center items-center py-6">
              <svg className="w-full h-auto max-w-85" viewBox="0 0 320 220" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Desk Lamp */}
                <path d="M40 180 L70 120 L100 120" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" />
                <path d="M95 105 L115 125 L85 135 Z" fill="#60A5FA" />
                <path d="M30 180 H80" stroke="#1E40AF" strokeWidth="4" strokeLinecap="round" />
                <circle cx="55" cy="180" r="6" fill="#1D4ED8" />

                {/* Laptop Base */}
                <rect x="110" y="170" width="130" height="10" rx="3" fill="#64748B" />
                <path d="M125 170 H225 L230 180 H120 Z" fill="#94A3B8" />

                {/* Laptop Screen */}
                <rect x="120" y="70" width="110" height="100" rx="6" fill="#1E293B" stroke="#475569" strokeWidth="4" />
                <rect x="126" y="76" width="98" height="88" rx="3" fill="#F8FAFC" />

                {/* Envelopes inside screen */}
                <g className="animate-pulse">
                  <rect x="136" y="86" width="30" height="20" rx="3" fill="#C084FC" />
                  <path d="M136 86 L151 98 L166 86" stroke="#FFFFFF" strokeWidth="1.5" />

                  <rect x="176" y="86" width="38" height="24" rx="3" fill="#A855F7" />
                  <path d="M176 86 L195 100 L214 86" stroke="#FFFFFF" strokeWidth="1.5" />

                  <rect x="146" y="116" width="40" height="26" rx="3" fill="#7C3AED" />
                  <path d="M146 116 L166 131 L186 116" stroke="#FFFFFF" strokeWidth="1.5" />
                </g>

                {/* Cactus Plant */}
                <rect x="250" y="150" width="30" height="30" rx="4" fill="#FDE047" stroke="#CA8A04" strokeWidth="2" />
                <path d="M265 150 V110 M265 125 H255 V115 M265 135 H275 V125" stroke="#16A34A" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>

              {/* Floating Action Badge */}
              <div className="absolute -top-2 -right-2 sm:right-2 bg-white rounded-2xl p-3 shadow-lg border border-purple-100 flex items-center gap-2.5 animate-bounce">
                <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                  <BsCheckCircleFill className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-900">Unsubscribed!</p>
                  <p className="text-[11px] text-gray-500">12 spam emails removed</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}