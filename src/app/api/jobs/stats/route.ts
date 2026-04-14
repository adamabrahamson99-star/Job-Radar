import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/route-auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [total_active, new_today, applied_count, saved_count, scoreAgg] = await Promise.all([
    prisma.jobPosting.count({
      where: { user_id: userId, is_active: true, NOT: { status: "NOT_INTERESTED" } },
    }),
    prisma.jobPosting.count({
      where: { user_id: userId, first_seen_at: { gte: oneDayAgo }, is_active: true },
    }),
    prisma.jobPosting.count({
      where: { user_id: userId, status: "APPLIED" },
    }),
    prisma.jobPosting.count({
      where: { user_id: userId, status: "SAVED", is_active: true },
    }),
    prisma.jobPosting.aggregate({
      where: { user_id: userId, is_active: true, NOT: { status: "NOT_INTERESTED" } },
      _avg: { match_score: true },
    }),
  ]);

  const avg_match_score = scoreAgg._avg.match_score
    ? Math.round(scoreAgg._avg.match_score)
    : 0;

  return NextResponse.json({ total_active, new_today, applied_count, saved_count, avg_match_score });
}
