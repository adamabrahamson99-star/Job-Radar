import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/route-auth";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.RAILWAY_STATIC_URL ??
    "http://localhost:3000";

  try {
    const stripe = getStripe();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripe_customer_id: true },
    });

    if (!user?.stripe_customer_id) {
      // User has no Stripe customer yet — send them to the pricing page instead
      return NextResponse.json({
        url: `${appUrl}/dashboard/billing`,
      });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${appUrl}/dashboard/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    console.error("[STRIPE] portal-session error:", err);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}
