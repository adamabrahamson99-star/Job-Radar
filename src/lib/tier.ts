/**
 * Shared tier limit constants for Job Radar.
 * Single source of truth — import from here instead of defining inline.
 */

export const TIER_COMPANY_LIMITS: Record<string, number> = {
  FREE: 3,
  STARTER: 15,
  PRO: 50,
  UNLIMITED: Infinity,
};

export const TIER_LOCATION_LIMITS: Record<string, number> = {
  FREE: 0,
  STARTER: 1,
  PRO: 3,
  UNLIMITED: Infinity,
};

/** Maximum number of manual checks a FREE tier user can run per month. */
export const MANUAL_CHECK_MONTHLY_LIMIT = 3;

/** Tiers that have access to premium features (instant alerts, threshold control). */
export const PREMIUM_TIERS = ["PRO", "UNLIMITED", "TRIALING"] as const;
export type PremiumTier = (typeof PREMIUM_TIERS)[number];

/** Returns the company limit for a given tier, defaulting to FREE if unknown. */
export function getTierCompanyLimit(tier: string): number {
  return TIER_COMPANY_LIMITS[tier] ?? TIER_COMPANY_LIMITS.FREE;
}

/** Returns the location keyword limit for a given tier, defaulting to FREE if unknown. */
export function getTierLocationLimit(tier: string): number {
  return TIER_LOCATION_LIMITS[tier] ?? TIER_LOCATION_LIMITS.FREE;
}
