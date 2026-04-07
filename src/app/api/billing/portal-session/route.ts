import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * MOCK MODE: Returns a redirect to the billing page.
 * Replace with real Stripe Customer Portal when STRIPE_SECRET_KEY is configured.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  console.log("[MOCK STRIPE] portal-session called");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.RAILWAY_STATIC_URL ?? "http://localhost:3000";
  return NextResponse.json({ url: `${appUrl}/dashboard/billing` });
}
