import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BsCheckCircleFill, BsXCircleFill, BsCircleFill } from "react-icons/bs";

export function Pricing() {
  return (
    <section id="pricing" className="py-16 md:py-24 bg-gray-50/80 border-t border-gray-200/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-4">
            How much does it costs
          </h2>
          <p className="text-base sm:text-lg text-gray-600 leading-relaxed">
            Unsubscribe from 10 emails for free - no credit card required. 14 day money back guarantee
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          {/* Freemium Card */}
          <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm flex flex-col justify-between hover:border-purple-200 transition-colors">
            <div>
              <h3 className="text-2xl font-bold text-primary mb-2">Freemium</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-extrabold text-gray-900">$0</span>
                <span className="text-gray-500 font-medium">/month</span>
              </div>
              <p className="text-sm text-gray-500 mb-8">Get started for free</p>

              <ul className="space-y-4 text-sm font-medium mb-8">
                <li className="flex items-center gap-3 text-gray-800">
                  <BsCheckCircleFill className="w-5 h-5 text-emerald-500 shrink-0" />
                  <span>1 email account</span>
                </li>
                <li className="flex items-center gap-3 text-gray-800">
                  <BsCheckCircleFill className="w-5 h-5 text-emerald-500 shrink-0" />
                  <span>Bulk unsubscribe</span>
                </li>
                <li className="flex items-center gap-3 text-gray-800">
                  <BsCheckCircleFill className="w-5 h-5 text-emerald-500 shrink-0" />
                  <span>Max 10 emails unsubscribe</span>
                </li>
                <li className="flex items-center gap-3 text-gray-400">
                  <BsXCircleFill className="w-5 h-5 text-rose-500/80 shrink-0" />
                  <span className="line-through">Multiple email accounts</span>
                </li>
                <li className="flex items-center gap-3 text-gray-400">
                  <BsXCircleFill className="w-5 h-5 text-rose-500/80 shrink-0" />
                  <span className="line-through">Unlimited unsubscribe</span>
                </li>
              </ul>
            </div>

            <Link href="/auth/signup" className="w-full">
              <Button variant="outline" className="w-full border-2 border-primary/30 text-primary hover:bg-purple-50 rounded-xl py-3 font-semibold text-base">
                Get Started
              </Button>
            </Link>
          </div>

          {/* Premium Card */}
          <div className="relative bg-primary text-white rounded-3xl p-8 shadow-xl shadow-purple-200 flex flex-col justify-between overflow-hidden">
            {/* Recommended Badge */}
            <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-md text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-white/30">
              RECOMMENDED
            </div>

            <div>
              <h3 className="text-2xl font-bold text-white mb-2">Premium</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-extrabold text-white">$3.99</span>
                <span className="text-purple-200 font-medium">/month</span>
              </div>
              <p className="text-sm text-purple-200 mb-8">For power users</p>

              <ul className="space-y-4 text-sm font-medium mb-8">
                {/* <li className="flex items-center gap-3 text-white">
                  <BsCircleFill className="w-3 h-3 text-white shrink-0 ml-1" />
                  <span>3 email account</span>
                </li> */}
                <li className="flex items-center gap-3 text-white">
                  <BsCircleFill className="w-3 h-3 text-white shrink-0 ml-1" />
                  <span>Bulk unsubscribe</span>
                </li>
                <li className="flex items-center gap-3 text-white">
                  <BsCircleFill className="w-3 h-3 text-white shrink-0 ml-1" />
                  <span>Unlimited unsubscribe</span>
                </li>
                <li className="flex items-center gap-3 text-white">
                  <BsCircleFill className="w-3 h-3 text-white shrink-0 ml-1" />
                  <span>Multiple email accounts</span>
                </li>
                <li className="flex items-center gap-3 text-white">
                  <BsCircleFill className="w-3 h-3 text-white shrink-0 ml-1" />
                  <span>Priority support</span>
                </li>
              </ul>
            </div>

            <Link href="/auth/signup" className="w-full">
              <Button className="w-full bg-purple-900 hover:bg-purple-950 text-white rounded-xl py-3 font-semibold text-base shadow-md">
                Upgrade Now
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}