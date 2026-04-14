import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/route-auth";

async function getCompanyOrFail(id: string, userId: string) {
  const company = await prisma.company.findFirst({ where: { id, user_id: userId } });
  return company;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const company = await getCompanyOrFail(params.id, userId);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const allowedFields = ["company_name", "career_page_url", "is_active"] as const;
  const updateData: Record<string, any> = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      if (field === "career_page_url") {
        try { new URL(body[field]); } catch { return NextResponse.json({ error: "Invalid URL" }, { status: 400 }); }
      }
      updateData[field] = body[field];
    }
  }

  const updated = await prisma.company.update({ where: { id: params.id }, data: updateData });
  return NextResponse.json({ company: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const company = await getCompanyOrFail(params.id, userId);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete all job postings associated with this company before removing it.
  // The FK (company_id) is nullable with no cascade, so postings would otherwise
  // remain orphaned in the feed with a null company_id but the original company_name.
  await prisma.jobPosting.deleteMany({ where: { company_id: params.id } });
  await prisma.company.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
