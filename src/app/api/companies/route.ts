import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const TIER_COMPANY_LIMITS: Record<string, number> = {
  FREE: 3,
  STARTER: 15,
  PRO: 50,
  UNLIMITED: Infinity,
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const companies = await prisma.company.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
  });

  return NextResponse.json({ companies });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const tier = (session.user as any).subscriptionTier ?? "FREE";

  const { company_name, career_page_url } = await req.json();

  if (!company_name?.trim() || !career_page_url?.trim()) {
    return NextResponse.json({ error: "Company name and URL are required" }, { status: 400 });
  }

  // URL validation
  try {
    new URL(career_page_url);
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
  }

  // Enforce tier limit
  const limit = TIER_COMPANY_LIMITS[tier] ?? 3;
  if (limit !== Infinity) {
    const count = await prisma.company.count({ where: { user_id: userId } });
    if (count >= limit) {
      return NextResponse.json(
        {
          error: `Company limit reached`,
          limit,
          tier,
          upgrade_required: true,
        },
        { status: 403 }
      );
    }
  }

  const company = await prisma.company.create({
    data: { user_id: userId, company_name: company_name.trim(), career_page_url: career_page_url.trim() },
  });

  return NextResponse.json({ company }, { status: 201 });
}
