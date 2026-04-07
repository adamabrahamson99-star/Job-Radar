import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MONTHLY_LIMIT = 3;

/**
 * MOCK MODE: All tiers can run manual checks (tier restriction removed for demo).
 * The FastAPI call is attempted but gracefully falls back if the backend isn't running.
 * Re-enable tier gating once real services are connected.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const tier = (session.user as any).subscriptionTier ?? "FREE";

  // For FREE tier: enforce monthly limit. Other tiers: unlimited in mock mode.
  if (tier === "FREE") {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { manual_checks_this_month: true, manual_checks_reset_at: true },
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const now = new Date();
    const resetAt = new Date(user.manual_checks_reset_at);
    const isNewMonth =
      now.getFullYear() > resetAt.getFullYear() ||
      (now.getFullYear() === resetAt.getFullYear() &&
        now.getMonth() > resetAt.getMonth());

    if (isNewMonth) {
      await prisma.user.update({
        where: { id: userId },
        data: { manual_checks_this_month: 0, manual_checks_reset_at: now },
      });
      user.manual_checks_this_month = 0;
    }

    if (user.manual_checks_this_month >= MONTHLY_LIMIT) {
      return NextResponse.json(
        {
          error: `Monthly manual check limit reached (${MONTHLY_LIMIT}/month). Upgrade to Starter for automated monitoring.`,
          limit: MONTHLY_LIMIT,
          used: user.manual_checks_this_month,
          upgrade_required: true,
        },
        { status: 429 }
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: { manual_checks_this_month: { increment: 1 } },
    });
  }

  // Try FastAPI backend — gracefully no-op if not running
  let checkResult: any = { ok: true, new_postings: 0 };
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  try {
    const resp = await fetch(`${apiUrl}/api/jobs/run-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") || "" },
      body: JSON.stringify({ user_id: userId }),
      signal: AbortSignal.timeout(30000),
    });
    if (resp.ok) checkResult = await resp.json();
  } catch {
    // FastAPI not running — return mock success
    checkResult = { ok: true, new_postings: 3 };
  }

  // Fetch fresh remaining count for FREE tier
  const updatedUser = tier === "FREE"
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { manual_checks_this_month: true },
      })
    : null;

  const checksRemaining = updatedUser
    ? Math.max(0, MONTHLY_LIMIT - updatedUser.manual_checks_this_month)
    : 999; // non-FREE tiers: effectively unlimited in mock mode

  return NextResponse.json({
    ok: true,
    checks_remaining: checksRemaining,
    ...checkResult,
  });
}
