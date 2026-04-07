import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = ["NEW", "SAVED", "APPLIED", "NOT_INTERESTED"] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const { status } = await req.json();

  if (!VALID_STATUSES.includes(status as ValidStatus)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  // Verify ownership
  const posting = await prisma.jobPosting.findFirst({
    where: { id: params.id, user_id: userId },
  });
  if (!posting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.jobPosting.update({
    where: { id: params.id },
    data: { status: status as ValidStatus },
  });

  return NextResponse.json({ posting: updated });
}
