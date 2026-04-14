import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/route-auth";

/**
 * Proxy to FastAPI GET /api/jobs/check-status/{job_id}.
 * Returns { status: "running" | "complete" | "error", result?, error? }
 *
 * Returns 404 when the job_id is unknown (e.g. after a FastAPI restart).
 * The frontend should treat a 404 as "check complete — please refresh".
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  try {
    const resp = await fetch(
      `${apiUrl}/api/jobs/check-status/${params.jobId}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (resp.status === 404) {
      // Service restarted — job_id was lost from memory.
      // Treat as complete so the user can refresh and see results.
      return NextResponse.json({ status: "lost" }, { status: 200 });
    }

    if (!resp.ok) {
      return NextResponse.json({ status: "error", error: "Backend error" }, { status: 502 });
    }

    return NextResponse.json(await resp.json());
  } catch {
    return NextResponse.json(
      { status: "error", error: "Backend unavailable" },
      { status: 503 }
    );
  }
}
