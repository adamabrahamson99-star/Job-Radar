import Link from "next/link";

interface UpgradePromptProps {
  requiredTier: "STARTER" | "PRO" | "UNLIMITED";
  featureName?: string;
  compact?: boolean;
}

const TIER_LABELS: Record<string, string> = {
  STARTER: "Starter",
  PRO: "Pro",
  UNLIMITED: "Unlimited",
};

export function UpgradePrompt({ requiredTier, featureName, compact = false }: UpgradePromptProps) {
  const tierLabel = TIER_LABELS[requiredTier] ?? requiredTier;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
        </svg>
        {tierLabel}+
        <Link href="/dashboard/billing" className="text-blue-400 hover:text-blue-300 transition-colors">
          Upgrade →
        </Link>
      </span>
    );
  }

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/15">
      <div className="w-6 h-6 rounded-lg bg-blue-500/15 border border-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg className="w-3.5 h-3.5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-blue-300 font-medium mb-0.5">
          {featureName ? `${featureName} requires ${tierLabel} or above` : `Available on ${tierLabel} and above`}
        </p>
        <p className="text-[11px] text-blue-400/60">
          Unlock more with a plan upgrade.{" "}
          <Link href="/dashboard/billing" className="underline hover:text-blue-300 transition-colors">
            Upgrade →
          </Link>
        </p>
      </div>
    </div>
  );
}
