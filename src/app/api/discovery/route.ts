import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/route-auth";
import { TIER_LOCATION_LIMITS } from "@/lib/tier";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const settings = await prisma.discoverySettings.findUnique({ where: { user_id: userId } });

  // If no settings yet, return defaults pre-populated from profile
  if (!settings) {
    const profile = await prisma.candidateProfile.findUnique({
      where: { user_id: userId },
      select: { preferred_locations: true, target_roles: true },
    });
    return NextResponse.json({
      settings: {
        greenhouse_enabled: false,
        lever_enabled: false,
        ashby_enabled: false,
        location_keywords: profile?.preferred_locations ?? [],
        role_keywords: profile?.target_roles ?? [],
      },
    });
  }

  return NextResponse.json({ settings });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId, tier } = auth;

  const body = await req.json();

  // FREE tier cannot use ATS discovery
  if (tier === "FREE" && (body.greenhouse_enabled || body.lever_enabled || body.ashby_enabled)) {
    return NextResponse.json(
      { error: "ATS discovery requires a paid plan", upgrade_required: true },
      { status: 403 }
    );
  }

  // Enforce location limit
  const locationLimit = TIER_LOCATION_LIMITS[tier] ?? 0;
  if (locationLimit !== Infinity && (body.location_keywords?.length ?? 0) > locationLimit) {
    return NextResponse.json(
      {
        error: `Your plan allows up to ${locationLimit} location${locationLimit === 1 ? "" : "s"}`,
        upgrade_required: true,
      },
      { status: 403 }
    );
  }

  const settings = await prisma.discoverySettings.upsert({
    where: { user_id: userId },
    update: {
      greenhouse_enabled: body.greenhouse_enabled ?? false,
      lever_enabled: body.lever_enabled ?? false,
      ashby_enabled: body.ashby_enabled ?? false,
      location_keywords: body.location_keywords ?? [],
      role_keywords: body.role_keywords ?? [],
    },
    create: {
      user_id: userId,
      greenhouse_enabled: body.greenhouse_enabled ?? false,
      lever_enabled: body.lever_enabled ?? false,
      ashby_enabled: body.ashby_enabled ?? false,
      location_keywords: body.location_keywords ?? [],
      role_keywords: body.role_keywords ?? [],
    },
  });

  return NextResponse.json({ settings });
}
