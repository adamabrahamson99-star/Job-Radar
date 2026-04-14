import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/route-auth";
import { TIER_COMPANY_LIMITS } from "@/lib/tier";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const companies = await prisma.company.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
  });

  return NextResponse.json({ companies });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId, tier } = auth;

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

  // Fire-and-forget URL preview — provides early feedback without blocking the save.
  // Non-blocking: company is already created above regardless of outcome.
  let preview: Record<string, unknown> | null = null;
  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const secret = process.env.INTERNAL_API_SECRET ?? "";
    const previewRes = await fetch(`${backendUrl}/api/jobs/validate-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
        "X-Internal-User-ID": userId,
      },
      body: JSON.stringify({ url: career_page_url.trim() }),
      signal: AbortSignal.timeout(20_000),
    });
    if (previewRes.ok) {
      preview = await previewRes.json();
    }
  } catch {
    // Preview failure is non-fatal — company is saved, just no early feedback
  }

  return NextResponse.json({ company, preview }, { status: 201 });
}
