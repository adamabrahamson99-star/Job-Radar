import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, { apiVersion: "2024-04-10", typescript: true });
  }
  return _stripe;
}

/** Convenience alias — use getStripe() in route handlers */
export const stripe = { get: getStripe } as unknown as Stripe;
// Route files should call getStripe() directly rather than importing stripe

export const PRICE_IDS = {
  STARTER: {
    monthly: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID ?? "",
    annual: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID ?? "",
  },
  PRO: {
    monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "",
    annual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID ?? "",
  },
  UNLIMITED: {
    monthly: process.env.STRIPE_UNLIMITED_MONTHLY_PRICE_ID ?? "",
    annual: process.env.STRIPE_UNLIMITED_ANNUAL_PRICE_ID ?? "",
  },
} as const;

/** Reverse-map a Stripe Price ID back to a tier name */
export function tierFromPriceId(priceId: string): string | null {
  for (const [tier, cycles] of Object.entries(PRICE_IDS)) {
    if (Object.values(cycles).includes(priceId as any)) return tier;
  }
  return null;
}
