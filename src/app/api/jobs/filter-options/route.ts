import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/route-auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const where = { user_id: userId, is_active: true };

  const [roleRows, locationRows] = await Promise.all([
    prisma.jobPosting.findMany({
      where: { ...where, role_category: { not: null } },
      select: { role_category: true },
      distinct: ["role_category"],
      orderBy: { role_category: "asc" },
    }),
    prisma.jobPosting.findMany({
      where: { ...where, location: { not: "" } },
      select: { location: true },
      distinct: ["location"],
      orderBy: { location: "asc" },
    }),
  ]);

  const role_categories = roleRows
    .map((r) => r.role_category)
    .filter((c): c is string => !!c);

  const locations = locationRows
    .map((r) => r.location)
    .filter((l) => l && l !== "Not specified")
    .slice(0, 50);

  return NextResponse.json({ role_categories, locations });
}
