"use client";

import { Button } from "@/components/ui/Button";

interface OnboardingWelcomeProps {
  onNext: () => void;
}

const features = [
  {
    icon: (
      <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: "AI Match Scoring",
    desc: "Every job is scored 0-100 against your profile with a detailed explanation.",
  },
  {
    icon: (
      <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
    title: "Company Watchlist",
    desc: "Add target companies and Radar monitors their career pages for new postings.",
  },
  {
    icon: (
      <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: "Resume Intelligence",
    desc: "Upload your resume once. Radar parses it and uses it to match every job.",
  },
  {
    icon: (
      <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: "ATS Integration",
    desc: "Pulls live job postings directly from Greenhouse, Lever, and Ashby.",
  },
];

export function OnboardingWelcome({ onNext }: OnboardingWelcomeProps) {
  return (
    <div className="text-center">
      {/* Radar animation */}
      <div className="flex justify-center mb-8">
        <div className="relative w-24 h-24">
          <div className="absolute inset-0 rounded-full border border-blue-500/20 animate-ping" style={{ animationDuration: "3s" }} />
          <div className="absolute inset-2 rounded-full border border-blue-500/30 animate-ping" style={{ animationDuration: "3s", animationDelay: "0.5s" }} />
          <div className="absolute inset-4 rounded-full border border-blue-500/50" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.8)]" />
          </div>
        </div>
      </div>

      <h1
        className="text-3xl font-bold text-text-primary mb-3"
        style={{ fontFamily: "Syne, sans-serif" }}
      >
        Welcome to Radar
      </h1>
      <p className="text-text-secondary max-w-md mx-auto mb-10 leading-relaxed">
        Your AI-powered job intelligence platform. Radar monitors the market, scores every
        match against your profile, and surfaces the opportunities that actually fit.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-10 text-left">
        {features.map((f) => (
          <div
            key={f.title}
            className="bg-radar-surface border border-radar-border rounded-xl p-4 hover:border-blue-500/30 transition-all duration-200"
          >
            <div className="flex items-center gap-2.5 mb-2">
              {f.icon}
              <h3 className="text-sm font-semibold text-text-primary font-display">{f.title}</h3>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

      <Button size="lg" onClick={onNext} className="px-10" data-testid="button-get-started">
        Get started
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </Button>

      <p className="text-xs text-text-muted mt-4">
        Takes about 2 minutes · You can skip any step
      </p>
    </div>
  );
}
