import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const prefs = await prisma.notificationPreferences.findUnique({ where: { user_id: userId } });

  return NextResponse.json({
    preferences: prefs ?? {
      email_enabled: true,
      instant_alert_threshold: 75,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const tier = (session.user as any).subscriptionTier ?? "FREE";
  const { email_enabled, instant_alert_threshold } = await req.json();

  // Validate threshold — only PRO/UNLIMITED/TRIALING can set it
  const canSetThreshold = ["PRO", "UNLIMITED", "TRIALING"].includes(tier);
  const threshold = canSetThreshold
    ? Math.min(100, Math.max(50, parseInt(instant_alert_threshold ?? "75")))
    : 75;

  const prefs = await prisma.notificationPreferences.upsert({
    where: { user_id: userId },
    update: {
      email_enabled: Boolean(email_enabled),
      instant_alert_threshold: threshold,
    },
    create: {
      user_id: userId,
      email_enabled: Boolean(email_enabled),
      instant_alert_threshold: threshold,
    },
  });

  return NextResponse.json({ preferences: prefs });
}
