import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/route-auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(50, parseInt(searchParams.get("limit") ?? "20"));
  const skip = (page - 1) * limit;

  const statusParam = searchParams.get("status");
  const roleCategory = searchParams.get("role_category");
  const expLevel = searchParams.get("experience_level");
  const locationParam = searchParams.get("location");
  const sourceParam = searchParams.get("source");
  const search = searchParams.get("search")?.trim();
  const sort = searchParams.get("sort") ?? "match_score";
  // "watchlist" = jobs tied to user's watched companies; "discovery" = global ATS jobs
  const view = searchParams.get("view"); // "watchlist" | "discovery" | null (= all)

  // Build where clause
  const where: any = { user_id: userId };

  // View toggle: discriminated by whether company_id is set
  if (view === "watchlist") {
    where.company_id = { not: null };
  } else if (view === "discovery") {
    where.company_id = null;
  }

  // Status filter — default hides NOT_INTERESTED
  if (statusParam && statusParam !== "ALL") {
    where.status = statusParam;
    if (statusParam !== "APPLIED") {
      where.is_active = true;
    }
  } else if (!statusParam) {
    where.NOT = { status: "NOT_INTERESTED" };
    where.is_active = true;
  } else {
    where.is_active = true;
  }

  if (roleCategory) {
    const cats = roleCategory.split(",").map((c) => c.trim()).filter(Boolean);
    if (cats.length === 1) where.role_category = cats[0];
    else if (cats.length > 1) where.role_category = { in: cats };
  }

  if (expLevel) {
    const levels = expLevel.split(",").map((l) => l.trim()).filter(Boolean);
    if (levels.length === 1) where.experience_level = levels[0];
    else if (levels.length > 1) where.experience_level = { in: levels };
  }

  if (locationParam) {
    where.location = { contains: locationParam, mode: "insensitive" };
  }

  if (sourceParam) {
    const sources = sourceParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (sources.length === 1) where.source = sources[0];
    else if (sources.length > 1) where.source = { in: sources };
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { company_name: { contains: search, mode: "insensitive" } },
      { description_summary: { contains: search, mode: "insensitive" } },
    ];
  }

  let orderBy: any;
  switch (sort) {
    case "recent":
      orderBy = [{ first_seen_at: "desc" }];
      break;
    case "company":
      orderBy = [{ company_name: "asc" }, { match_score: "desc" }];
      break;
    default:
      orderBy = [{ match_score: "desc" }, { first_seen_at: "desc" }];
  }

  const [postings, total] = await Promise.all([
    prisma.jobPosting.findMany({ where, orderBy, skip, take: limit }),
    prisma.jobPosting.count({ where }),
  ]);

  return NextResponse.json({
    postings,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
