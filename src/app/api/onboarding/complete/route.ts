import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.user.update({
      where: { id: (session.user as any).id },
      data: { onboarding_completed: true },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to complete onboarding:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
