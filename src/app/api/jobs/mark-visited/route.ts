import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;

  await prisma.jobPosting.updateMany({
    where: { user_id: userId, is_new_since_last_visit: true },
    data: { is_new_since_last_visit: false },
  });

  return NextResponse.json({ ok: true });
}
