import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const where = { user_id: userId, is_active: true };

  // Get distinct values for filter dropdowns
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
    .slice(0, 50); // cap for dropdown sanity

  return NextResponse.json({ role_categories, locations });
}
