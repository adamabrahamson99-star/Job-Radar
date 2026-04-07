import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Proxy for the FastAPI resume upload endpoint.
 *
 * The browser calls this Next.js route (same origin — no CORS issues).
 * This route validates the session server-side, then forwards the file
 * to FastAPI with internal auth headers so FastAPI never needs a JWT.
 */
export async function POST(req: NextRequest) {
  // Validate session server-side
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const userId = (session.user as any).id;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const internalSecret = process.env.INTERNAL_API_SECRET ?? "";

  if (!internalSecret) {
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
    fastapiRes = await fetch(`${apiUrl}/api/profile/upload-resume`, {
      method: "POST",
      body: formData,
      headers: {
        "X-Internal-User-ID": userId,
        "X-Internal-Secret": internalSecret,
      },
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
