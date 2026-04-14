import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/route-auth";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  await prisma.jobPosting.updateMany({
    where: { user_id: userId, is_new_since_last_visit: true },
    data: { is_new_since_last_visit: false },
  });

  return NextResponse.json({ ok: true });
}
