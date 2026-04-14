import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/route-auth";
import { PREMIUM_TIERS } from "@/lib/tier";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const prefs = await prisma.notificationPreferences.findUnique({ where: { user_id: userId } });

  return NextResponse.json({
    preferences: prefs ?? {
      email_enabled: true,
      instant_alert_threshold: 75,
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId, tier } = auth;

  const { email_enabled, instant_alert_threshold } = await req.json();

  // Validate threshold — only PRO/UNLIMITED/TRIALING can set it
  const canSetThreshold = (PREMIUM_TIERS as readonly string[]).includes(tier);
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
