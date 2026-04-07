import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MOCK MODE: Webhook handler is a no-op.
 * Replace with real Stripe webhook verification when STRIPE_WEBHOOK_SECRET is set.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  console.log("[MOCK STRIPE] webhook received, ignoring:", body.slice(0, 80));
  return NextResponse.json({ received: true });
}
