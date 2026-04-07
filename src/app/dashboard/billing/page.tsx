"use client";

import { useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { PRICE_IDS } from "@/lib/stripe";

// ─── Plan definitions ─────────────────────────────────────────────────────────

const PLANS = [
  {
    tier: "FREE",
    name: "Free",
    monthly: 0,
    annual: 0,
    color: "border-radar-border",
    accentColor: "text-text-muted",
    features: [
      "3 companies",
      "Manual checks only",
      "3 checks per month",
      "No ATS discovery",
      "No email notifications",
    ],
  },
  {
    tier: "STARTER",
    name: "Starter",
    monthly: 9,
    annual: 90,
    color: "border-blue-500/30",
    accentColor: "text-blue-400",
    features: [
      "15 companies",
      "Automated 2× per week",
      "ATS discovery (1 location)",
      "Weekly digest email",
      "Match score explanations",
    ],
  },
  {
    tier: "PRO",
    name: "Pro",
    monthly: 19,
    annual: 190,
    color: "border-green-500/30",
    accentColor: "text-green-400",
    popular: true,
    features: [
      "50 companies",
      "Automated daily",
      "ATS discovery (3 locations)",
      "Daily digest + instant alerts",
      "Custom alert threshold",
    ],
  },
  {
    tier: "UNLIMITED",
    name: "Unlimited",
    monthly: 34,
    annual: 340,
    color: "border-purple-500/30",
    accentColor: "text-purple-400",
    features: [
      "Unlimited companies",
      "Checks every 6 hours",
      "Unlimited ATS discovery",
      "All notifications",
      "Priority support",
    ],
  },
] as const;

const TIER_ORDER = ["FREE", "STARTER", "PRO", "UNLIMITED"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPriceId(tier: string, cycle: "monthly" | "annual"): string {
  const ids = PRICE_IDS as Record<string, Record<string, string>>;
  return ids[tier]?.[cycle] ?? "";
}

function usagePercent(used: number, max: number): number {
  if (max === Infinity || max === 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

// ─── Usage meter component ────────────────────────────────────────────────────

function UsageMeter({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = usagePercent(used, max);
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-blue-500";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className="font-mono text-text-primary">
          {used} of {max === Infinity ? "∞" : max}
        </span>
      </div>
      {max !== Infinity && (
        <div className="h-1.5 bg-radar-elevated rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500", color)}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Billing page ─────────────────────────────────────────────────────────────

function BillingContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const upgraded = searchParams.get("upgraded") === "true";

  const user = session?.user as any;
  const currentTier = user?.subscriptionTier ?? "FREE";
  const currentStatus = user?.subscriptionStatus ?? "ACTIVE";
  const isTrialing = currentStatus === "TRIALING";
  const trialEndsAt = user?.trialEndsAt ? new Date(user.trialEndsAt) : null;
  const daysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86400000))
    : 0;

  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [companyCount, setCompanyCount] = useState(0);
  const [checksUsed, setChecksUsed] = useState(0);

  useEffect(() => {
    fetch("/api/companies").then((r) => r.json()).then((d) => setCompanyCount(d.companies?.length ?? 0)).catch(() => {});
    // We'd fetch manual check count from user — approximated from stats
  }, []);

  const currentPlan = PLANS.find((p) => p.tier === currentTier) ?? PLANS[0];
  const currentTierIndex = TIER_ORDER.indexOf(currentTier);

  const handleUpgrade = async (tier: string) => {
    if (tier === currentTier) return;
    const priceId = getPriceId(tier, billingCycle);
    if (!priceId) {
      alert("Price ID not configured. Add the Stripe Price IDs to your .env file.");
      return;
    }

    setLoadingTier(tier);
    try {
      const res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price_id: priceId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      alert("Failed to start checkout. Please try again.");
    } finally {
      setLoadingTier(null);
    }
  };

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal-session", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error ?? "Failed to open billing portal.");
    } catch {
      alert("Failed to open billing portal.");
    } finally {
      setPortalLoading(false);
    }
  };

  const COMPANY_LIMITS: Record<string, number> = {
    FREE: 3, STARTER: 15, PRO: 50, UNLIMITED: Infinity,
  };
  const companyLimit = COMPANY_LIMITS[currentTier] ?? 3;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1
        className="text-2xl font-bold text-text-primary mb-1"
        style={{ fontFamily: "Syne, sans-serif" }}
      >
        Billing
      </h1>
      <p className="text-sm text-text-secondary mb-8">Manage your plan and payment details.</p>

      {/* Success banner */}
      {upgraded && (
        <div className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-3 animate-fade-in">
          <svg className="w-5 h-5 text-green-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <p className="text-green-300 text-sm">
            You&apos;re now on <strong>{currentPlan.name}</strong>. Enjoy the upgrade.
          </p>
        </div>
      )}

      {/* Current plan card */}
      <div className="bg-radar-surface border border-radar-border rounded-2xl p-6 mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-mono text-text-muted mb-1">CURRENT PLAN</p>
            <div className="flex items-center gap-2 mb-1">
              <h2
                className="text-xl font-bold text-text-primary"
                style={{ fontFamily: "Syne, sans-serif" }}
              >
                {currentPlan.name}
              </h2>
              {isTrialing && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  TRIAL
                </span>
              )}
              {currentStatus === "PAST_DUE" && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-red-500/15 text-red-400 border border-red-500/30">
                  PAST DUE
                </span>
              )}
            </div>
            {isTrialing && trialEndsAt && (
              <p className="text-sm text-blue-300 mt-1">
                Trial ends {trialEndsAt.toLocaleDateString()} ({daysLeft} day{daysLeft !== 1 ? "s" : ""} left)
              </p>
            )}
            {currentTier === "FREE" && !isTrialing && (
              <p className="text-sm text-text-muted mt-1">Free plan · No billing</p>
            )}
          </div>

          {currentTier !== "FREE" || isTrialing ? (
            <button
              onClick={handleManageBilling}
              disabled={portalLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-radar-elevated border border-radar-border text-sm text-text-secondary hover:text-text-primary hover:border-blue-500/30 transition-all"
            >
              {portalLoading ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4zM18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" />
                </svg>
              )}
              Manage Billing
            </button>
          ) : null}
        </div>

        {/* Usage meters */}
        {(currentTier === "FREE" || currentTier === "STARTER") && (
          <div className="mt-5 pt-5 border-t border-radar-border space-y-3">
            <UsageMeter
              label="Companies"
              used={companyCount}
              max={companyLimit}
            />
            {currentTier === "FREE" && (
              <UsageMeter
                label="Manual checks this month"
                used={checksUsed}
                max={3}
              />
            )}
          </div>
        )}
      </div>

      {/* Billing cycle toggle */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-text-primary" style={{ fontFamily: "Syne, sans-serif" }}>
          Plans
        </h2>
        <div className="flex items-center gap-1 bg-radar-surface border border-radar-border rounded-xl p-1">
          {(["monthly", "annual"] as const).map((cycle) => (
            <button
              key={cycle}
              onClick={() => setBillingCycle(cycle)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                billingCycle === cycle
                  ? "bg-radar-elevated text-text-primary"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {cycle === "monthly" ? "Monthly" : "Annual"}
              {cycle === "annual" && (
                <span className="ml-1.5 text-[10px] bg-green-500/15 text-green-400 border border-green-500/20 rounded px-1 py-0.5">
                  Save ~20%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Pricing table */}
      <div className="grid grid-cols-4 gap-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.tier === currentTier;
          const planIndex = TIER_ORDER.indexOf(plan.tier);
          const isHigher = planIndex > currentTierIndex;
          const isLower = planIndex < currentTierIndex;
          const price = billingCycle === "monthly" ? plan.monthly : plan.annual;
          const isLoading = loadingTier === plan.tier;

          return (
            <div
              key={plan.tier}
              className={cn(
                "relative bg-radar-surface border rounded-2xl p-5 flex flex-col",
                isCurrent ? plan.color : "border-radar-border",
                (plan as any).popular && !isCurrent && "ring-1 ring-blue-500/20"
              )}
            >
              {(plan as any).popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-2.5 py-0.5 bg-blue-500 text-white text-[10px] font-mono font-bold rounded-full">
                    POPULAR
                  </span>
                </div>
              )}

              <div className="mb-4">
                <p className={cn("text-xs font-mono font-semibold mb-1", plan.accentColor)}>
                  {plan.name.toUpperCase()}
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-text-primary font-mono">
                    {price === 0 ? "Free" : `$${price}`}
                  </span>
                  {price > 0 && (
                    <span className="text-xs text-text-muted">
                      /{billingCycle === "monthly" ? "mo" : "yr"}
                    </span>
                  )}
                </div>
              </div>

              <ul className="space-y-1.5 flex-1 mb-5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs text-text-secondary">
                    <svg className={cn("w-3.5 h-3.5 flex-shrink-0 mt-0.5", plan.accentColor)} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <button
                  disabled
                  className="w-full py-2 rounded-lg border border-radar-border text-xs text-text-muted cursor-not-allowed"
                >
                  Current Plan
                </button>
              ) : isHigher ? (
                <button
                  onClick={() => handleUpgrade(plan.tier)}
                  disabled={isLoading}
                  className="w-full py-2 rounded-lg bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors disabled:opacity-60"
                >
                  {isLoading ? "Redirecting..." : "Upgrade"}
                </button>
              ) : (
                <button
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                  className="w-full py-2 rounded-lg border border-radar-border text-xs text-text-secondary hover:text-text-primary hover:border-blue-500/20 transition-all disabled:opacity-60"
                >
                  Downgrade
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Trial CTA */}
      {isTrialing && (
        <div className="mt-6 p-5 rounded-2xl border border-blue-500/20 bg-blue-500/5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-200 mb-1">
              {daysLeft} day{daysLeft !== 1 ? "s" : ""} left in your Pro trial
            </p>
            <p className="text-xs text-blue-400/70">
              Subscribe before your trial ends to keep automated monitoring and AI scoring.
            </p>
          </div>
          <button
            onClick={() => handleUpgrade("PRO")}
            className="flex-shrink-0 px-5 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
          >
            Subscribe to Pro
          </button>
        </div>
      )}
    </div>
  );
}


export default function BillingPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto px-6 py-8"><div className="h-8 bg-radar-elevated rounded-lg animate-pulse w-32 mb-8" /></div>}>
      <BillingContent />
    </Suspense>
  );
}
