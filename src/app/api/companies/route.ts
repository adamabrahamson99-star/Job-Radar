import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/route-auth";
import { TIER_COMPANY_LIMITS } from "@/lib/tier";
import { backendFetch } from "@/lib/backend-fetch";
import { findCatalogCompany, atsCareerUrl } from "@/lib/company-catalog";

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

  const body = await req.json();
  const company_name: string = body.company_name ?? "";
  // Optional when adding from catalog — auto-generated from ATS info
  let career_page_url: string = body.career_page_url ?? "";
  // Layered sourcing: pre-resolved by the frontend when adding from the catalog
  const ats_source: string | undefined = body.ats_source;
  const ats_slug: string | undefined   = body.ats_slug;

  if (!company_name.trim()) {
    return NextResponse.json({ error: "Company name is required" }, { status: 400 });
  }

  // ── Layered sourcing: resolve ATS info ────────────────────────────────────
  // Priority 1: explicit ats_source/ats_slug from the catalog UI
  // Priority 2: auto-lookup in the catalog by name (manual adds)
  // Priority 3: fall back to the user-supplied URL (legacy scraper path)
  let resolvedAtsSource = ats_source ?? null;
  let resolvedAtsSlug   = ats_slug ?? null;

  if (!resolvedAtsSource) {
    const catalogMatch = findCatalogCompany(company_name.trim());
    if (catalogMatch?.ats_source) {
      resolvedAtsSource = catalogMatch.ats_source;
      resolvedAtsSlug   = catalogMatch.ats_slug ?? null;
    }
  }

  // Auto-generate career_page_url from ATS info if not provided
  if (!career_page_url.trim() && resolvedAtsSource && resolvedAtsSlug) {
    career_page_url = atsCareerUrl(resolvedAtsSource as any, resolvedAtsSlug);
  }

  if (!career_page_url.trim()) {
    return NextResponse.json(
      { error: "Career page URL is required for companies not in our catalog" },
      { status: 400 }
    );
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
    data: {
      user_id: userId,
      company_name: company_name.trim(),
      career_page_url: career_page_url.trim(),
      ats_source: resolvedAtsSource as any ?? undefined,
      ats_slug: resolvedAtsSlug ?? undefined,
    },
  });

  // Fire-and-forget URL preview — provides early feedback without blocking the save.
  // Non-blocking: company is already created above regardless of outcome.
  let preview: Record<string, unknown> | null = null;
  try {
    const previewRes = await backendFetch("/api/jobs/validate-url", userId, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
