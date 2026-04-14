import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/route-auth";
import { MANUAL_CHECK_MONTHLY_LIMIT } from "@/lib/tier";

/**
 * Kicks off a background job check via FastAPI and returns a job_id immediately.
 * The frontend polls GET /api/jobs/check-status/[jobId] for completion.
 * FREE tier monthly limit is enforced before the check is started.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId, tier } = auth;

  // For FREE tier: enforce monthly limit
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

    if (user.manual_checks_this_month >= MANUAL_CHECK_MONTHLY_LIMIT) {
      return NextResponse.json(
        {
          error: `Monthly manual check limit reached (${MANUAL_CHECK_MONTHLY_LIMIT}/month). Upgrade to Starter for automated monitoring.`,
          limit: MANUAL_CHECK_MONTHLY_LIMIT,
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

  // Fetch remaining count for FREE tier (used in response)
  const updatedUser =
    tier === "FREE"
      ? await prisma.user.findUnique({
          where: { id: userId },
          select: { manual_checks_this_month: true },
        })
      : null;

  const checksRemaining = updatedUser
    ? Math.max(0, MANUAL_CHECK_MONTHLY_LIMIT - updatedUser.manual_checks_this_month)
    : 999;

  // Fire the background check — FastAPI returns a job_id immediately
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const internalSecret = process.env.INTERNAL_API_SECRET ?? "";

  try {
    const resp = await fetch(`${apiUrl}/api/jobs/run-check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-User-ID": userId,
        "X-Internal-Secret": internalSecret,
      },
      body: JSON.stringify({ user_id: userId }),
      signal: AbortSignal.timeout(10000),
    });

    if (resp.ok) {
      const { job_id } = await resp.json();
      return NextResponse.json({
        ok: true,
        job_id,
        status: "running",
        checks_remaining: checksRemaining,
      });
    }

    return NextResponse.json({
      ok: false,
      status: "error",
      error: "Backend returned an error — check FastAPI logs.",
      checks_remaining: checksRemaining,
    });
  } catch {
    return NextResponse.json({
      ok: false,
      status: "error",
      error: "Could not reach backend — FastAPI may not be running.",
      checks_remaining: checksRemaining,
    });
  }
}
