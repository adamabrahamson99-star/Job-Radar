import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/route-auth";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await req.json();

    const allowedFields = [
      "experience_level",
      "years_of_experience",
      "skills",
      "target_roles",
      "education",
      "high_value_skills",
      "high_value_titles",
      "preferred_locations",
    ];

    const updateData: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    updateData.updated_at = new Date();

    const profile = await prisma.candidateProfile.upsert({
      where: { user_id: userId },
      update: updateData,
      create: {
        user_id: userId,
        experience_level: updateData.experience_level || "ENTRY",
        years_of_experience: updateData.years_of_experience || 0,
        skills: updateData.skills || [],
        target_roles: updateData.target_roles || [],
        education: updateData.education || [],
        high_value_skills: updateData.high_value_skills || [],
        high_value_titles: updateData.high_value_titles || [],
        preferred_locations: updateData.preferred_locations || [],
      },
    });

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
