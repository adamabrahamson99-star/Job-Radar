"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function TrialBanner() {
  const { data: session } = useSession();
  const [dismissed, setDismissed] = useState(false);

  const user = session?.user as any;
  const isTrialing = user?.subscriptionStatus === "TRIALING" || user?.subscriptionTier === "PRO" && user?.trialEndsAt;

  if (!isTrialing || dismissed) return null;

  // Compute days remaining
  const trialEnd = user?.trialEndsAt ? new Date(user.trialEndsAt) : null;
  const daysLeft = trialEnd
    ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000))
    : 14;

  return (
    <div className="flex items-center justify-between gap-3 px-6 py-2.5 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10 border-b border-blue-500/20 text-sm">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
        <span className="text-blue-200">
          You&apos;re on a free Pro trial —{" "}
          <span className="font-semibold font-mono">{daysLeft} day{daysLeft !== 1 ? "s" : ""}</span> remaining.
        </span>
        <Link
          href="/dashboard/billing"
          className="text-blue-400 hover:text-blue-300 font-medium underline transition-colors"
        >
          Upgrade to keep Pro features →
        </Link>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-blue-400/50 hover:text-blue-400 transition-colors flex-shrink-0"
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}
