import {
  BsBarChart,
  BsClock,
  BsEnvelopeCheck,
  BsFunnel,
  BsGear,
  BsPeople,
  BsShieldCheck,
  BsStars,
} from "react-icons/bs";
import type { ComponentType } from "react";

export type LandingPageContent = {
  title: string;
  eyebrow: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  accent: string;
  highlights: { title: string; description: string }[];
};

export const featurePages: Record<string, LandingPageContent> = {
  unsubscriber: {
    eyebrow: "Feature",
    title: "Unsubscribe without the busywork.",
    description: "KickAds finds the newsletters and promotional emails you no longer need, then helps you remove them in a few deliberate clicks.",
    icon: BsEnvelopeCheck,
    accent: "from-violet-600 to-purple-900",
    highlights: [
      { title: "Finds the noise", description: "See recurring senders and subscriptions in one focused view." },
      { title: "Acts on your behalf", description: "Follow legitimate unsubscribe paths without searching through every message." },
      { title: "Keeps you in control", description: "Review what will change before anything is removed." },
    ],
  },
  schedule: {
    eyebrow: "Feature",
    title: "Schedule your time for unsubscribing.",
    description: "Schedule helps you manage your inbox by setting aside dedicated times for unsubscribing, so incoming messages can wait until you are ready to deal with them.",
    icon: BsClock,
    accent: "from-indigo-600 to-violet-900",
    highlights: [
      { title: "Set a quiet window", description: "Choose when notifications and inbox work should pause." },
      { title: "Protect your attention", description: "Keep late-night messages from pulling you back into work." },
      { title: "Resume naturally", description: "Return to a clear, prioritized inbox when your window ends." },
    ],
  },
  "inbox-analytics": {
    eyebrow: "Feature",
    title: "Understand what fills your inbox.",
    description: "Inbox Analytics turns email volume into useful signals, helping you see which senders and patterns deserve your attention.",
    icon: BsBarChart,
    accent: "from-purple-600 to-fuchsia-900",
    highlights: [
      { title: "Spot the biggest senders", description: "See who contributes most to your daily email volume." },
      { title: "Measure the change", description: "Track how your inbox improves after each cleanup." },
      { title: "Make better decisions", description: "Use clear trends instead of guessing what to unsubscribe from." },
    ],
  },
  history: {
    eyebrow: "Feature",
    title: "A clear record of every cleanup.",
    description: "History keeps a simple timeline of the actions you have taken, so your inbox management stays transparent and easy to revisit.",
    icon: BsGear,
    accent: "from-slate-700 to-violet-900",
    highlights: [
      { title: "Review past actions", description: "See what was changed and when it happened." },
      { title: "Stay accountable", description: "Keep a reliable record of your inbox decisions." },
      { title: "Learn your patterns", description: "Understand which cleanup actions make the biggest difference." },
    ],
  },
  "sender-grouping": {
    eyebrow: "Feature",
    title: "See your inbox by sender.",
    description: "Sender Grouping organizes related messages together, making it easier to recognize patterns and act on entire subscriptions.",
    icon: BsPeople,
    accent: "from-fuchsia-600 to-purple-950",
    highlights: [
      { title: "Group related mail", description: "Turn a crowded inbox into a set of understandable sources." },
      { title: "Prioritize quickly", description: "Focus on the senders that have the greatest impact." },
      { title: "Clean up in context", description: "Make confident decisions with the full sender picture in view." },
    ],
  },
};

export const learnPages: Record<string, LandingPageContent> = {
  "why-kick-ads": {
    eyebrow: "About KickAds",
    title: "Your inbox should work for you.",
    description: "KickAds is built for people who want a cleaner inbox without spending their evenings managing subscriptions one email at a time.",
    icon: BsStars,
    accent: "from-purple-600 to-indigo-950",
    highlights: [
      { title: "Less manual work", description: "Replace repetitive cleanup with a focused workflow." },
      { title: "More useful email", description: "Make room for messages that genuinely matter." },
      { title: "Designed for clarity", description: "Every decision stays understandable and intentional." },
    ],
  },
  "how-it-works": {
    eyebrow: "How it works",
    title: "Three steps to a calmer inbox.",
    description: "Connect your account, review what KickAds finds, and choose the cleanup actions that fit the way you work.",
    icon: BsFunnel,
    accent: "from-violet-600 to-blue-950",
    highlights: [
      { title: "1. Connect", description: "Securely connect the inbox you want to organize." },
      { title: "2. Review", description: "Inspect senders, patterns, and recommended cleanup actions." },
      { title: "3. Clean up", description: "Apply the changes you want and keep the rest untouched." },
    ],
  },
  "how-data-is-being-used": {
    eyebrow: "Privacy and data",
    title: "Useful organization, respectful access.",
    description: "KickAds should help you understand your inbox without making your personal messages feel exposed. We keep access focused on the data needed for the features you use.",
    icon: BsShieldCheck,
    accent: "from-emerald-600 to-teal-950",
    highlights: [
      { title: "Purpose-limited access", description: "Use only the access needed to provide the selected experience." },
      { title: "Clear controls", description: "Understand what a feature does before you enable it." },
      { title: "Your decisions matter", description: "You decide what to review, remove, and keep." },
    ],
  },
};
