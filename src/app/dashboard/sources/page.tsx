"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { WatchlistTab } from "@/components/sources/WatchlistTab";
import { DiscoveryTab } from "@/components/sources/DiscoveryTab";
import { cn } from "@/lib/utils";

const TABS = [
  {
    id: "watchlist",
    label: "Watchlist",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
    desc: "Monitor company career pages",
  },
  {
    id: "discovery",
    label: "Discovery",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    desc: "ATS-powered job discovery",
  },
];

export default function SourcesPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<"watchlist" | "discovery">("watchlist");
  const tier = (session?.user as any)?.subscriptionTier ?? "FREE";

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="text-2xl font-bold text-text-primary mb-1"
          style={{ fontFamily: "Syne, sans-serif" }}
        >
          Sources
        </h1>
        <p className="text-sm text-text-secondary">
          Configure where Radar looks for jobs on your behalf.
        </p>
      </div>

      {/* Tier badge */}
      <div className="flex items-center gap-3 mb-6">
        <span className="inline-flex items-center gap-1.5 bg-radar-elevated border border-radar-border rounded-full px-3 py-1 text-xs font-mono text-text-secondary">
          <div className={cn(
            "w-1.5 h-1.5 rounded-full",
            tier === "FREE" ? "bg-text-muted" :
            tier === "STARTER" ? "bg-blue-400" :
            tier === "PRO" ? "bg-green-400" : "bg-purple-400"
          )} />
          {tier} PLAN
        </span>
        {tier === "FREE" && (
          <span className="text-xs text-text-muted">
            Manual checks only · Upgrade for automated monitoring
          </span>
        )}
        {tier === "STARTER" && (
          <span className="text-xs text-text-muted">
            Automated checks Mon + Thu at 7am UTC · Up to 15 companies
          </span>
        )}
        {tier === "PRO" && (
          <span className="text-xs text-text-muted">
            Automated checks daily at 7am UTC · Up to 50 companies
          </span>
        )}
        {tier === "UNLIMITED" && (
          <span className="text-xs text-text-muted">
            Automated checks every 6 hours · Unlimited companies
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-radar-surface border border-radar-border rounded-xl p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150",
              activeTab === tab.id
                ? "bg-radar-elevated text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            )}
            data-testid={`tab-${tab.id}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "watchlist" && <WatchlistTab tier={tier} />}
      {activeTab === "discovery" && <DiscoveryTab tier={tier} />}
    </div>
  );
}
