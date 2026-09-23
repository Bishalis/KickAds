"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BsEnvelope, BsChevronDown, BsList, BsX } from "react-icons/bs";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100 px-4 sm:px-8 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-md shadow-purple-200 group-hover:scale-105 transition-transform">
            <BsEnvelope className="w-6 h-6" />
          </div>
          <span className="text-2xl font-bold text-gray-900 tracking-tight">
            Kick<span className="text-primary">Ads</span>
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8">
          <div className="relative">
            <button 
              onClick={() => { setSelectOpen(!selectOpen); setLearnOpen(false); }}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-primary transition-colors cursor-pointer"
            >
              Features <BsChevronDown className={`w-3 h-3 transition-transform ${selectOpen ? "rotate-180" : ""}`} />
            </button>
            {selectOpen && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                <Link href="/features/unsubscriber" onClick={() => setSelectOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-primary">Unsubscriber</Link>
                <Link href="/features/schedule" onClick={() => setSelectOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-primary"> Schedule</Link>
                <Link href="/features/inbox-analytics" onClick={() => setSelectOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-primary">Inbox Analytics</Link>
                <Link href="/features/history" onClick={() => setSelectOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-primary">History</Link>
                <Link href="/features/sender-grouping" onClick={() => setSelectOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-primary">Sender Grouping</Link>
              </div>
            )}
          </div>

          <div className="relative">
            <button 
              onClick={() => { setLearnOpen(!learnOpen); setSelectOpen(false); }}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-primary transition-colors cursor-pointer"
            >
              Learn more <BsChevronDown className={`w-3 h-3 transition-transform ${learnOpen ? "rotate-180" : ""}`} />
            </button>
            {learnOpen && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                <Link href="/learn/why-kick-ads" onClick={() => setLearnOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-primary">Why Kick-Ads</Link>
                <Link href="/learn/how-it-works" onClick={() => setLearnOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-primary">How It Works</Link>
                <Link href="/learn/how-data-is-being-used" onClick={() => setLearnOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-primary">How data is being used</Link>
              </div>
            )}
          </div>

          <a href="/#pricing" className="text-sm font-medium text-gray-700 hover:text-primary transition-colors">
            Pricing
          </a>
        </nav>

        {/* Desktop Auth Buttons */}
        <div className="hidden md:flex items-center gap-3">
          <Link href="/auth/login">
            <Button className="btn-primary bg-primary hover:bg-purple-800 text-white rounded-lg px-6 py-2 shadow-sm transition-all hover:shadow-purple-200">
              Login
            </Button>
          </Link>
          <a href="#contact">
            <Button variant="outline" className="border-2 border-primary/20 text-primary hover:border-primary hover:bg-purple-50 rounded-lg px-5 py-2 font-medium">
              Contact Us
            </Button>
          </a>
        </div>

        {/* Mobile Menu Button */}
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
          className="md:hidden p-2 text-gray-700 hover:text-primary"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <BsX className="w-7 h-7" /> : <BsList className="w-7 h-7" />}
        </button>
      </div>

      {/* Mobile Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden pt-4 pb-2 border-t border-gray-100 mt-3 flex flex-col gap-3 animate-in fade-in">
          <Link href="/learn/how-it-works" onClick={() => setMobileMenuOpen(false)} className="py-2 text-sm font-medium text-gray-700 hover:text-primary">
            Learn More
          </Link>
          <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="py-2 text-sm font-medium text-gray-700 hover:text-primary">
            Pricing
          </a>
          <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
            <Link href="/auth/login" className="w-full">
              <Button className="w-full btn-primary bg-primary hover:bg-purple-800 text-white rounded-lg py-2.5">
                Login
              </Button>
            </Link>
            <a href="#contact" className="w-full">
              <Button variant="outline" className="w-full border-primary/20 text-primary hover:bg-purple-50 rounded-lg py-2.5">
                Contact Us
              </Button>
            </a>
          </div>
        </div>
      )}
    </header>
  );
}