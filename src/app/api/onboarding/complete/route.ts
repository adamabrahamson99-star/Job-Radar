import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/route-auth";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { onboarding_completed: true },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to complete onboarding:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
