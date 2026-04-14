import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/route-auth";
import { backendFetch, getInternalSecret } from "@/lib/backend-fetch";

/**
 * Proxy for the FastAPI resume upload endpoint.
 *
 * The browser calls this Next.js route (same origin — no CORS issues).
 * This route validates the session server-side, then forwards the file
 * to FastAPI with internal auth headers so FastAPI never needs a JWT.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  if (!getInternalSecret()) {
    console.error("[upload-resume proxy] INTERNAL_API_SECRET is not set");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  // Forward the multipart form data as-is
  const formData = await req.formData();

  let fastapiRes: Response;
  try {
    fastapiRes = await backendFetch("/api/profile/upload-resume", userId, {
      method: "POST",
      body: formData,
    });
  } catch (err) {
    console.error("[upload-resume proxy] FastAPI unreachable:", err);
    return NextResponse.json(
      { error: "Resume parsing service is unavailable. Please try again." },
      { status: 502 }
    );
  }

  const data = await fastapiRes.json().catch(() => ({}));
  return NextResponse.json(data, { status: fastapiRes.status });
}
