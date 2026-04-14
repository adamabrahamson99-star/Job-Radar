/**
 * Shared authentication helper for Next.js API route handlers.
 *
 * Usage:
 *   const auth = await requireAuth();
 *   if (auth instanceof NextResponse) return auth;   // 401 early-exit
 *   const { userId, tier } = auth;
 */

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

export interface AuthUser {
  userId: string;
  tier: string;
}

export async function requireAuth(): Promise<AuthUser | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = session.user as { id: string; subscriptionTier?: string };
  return {
    userId: user.id,
    tier: user.subscriptionTier ?? "FREE",
  };
}
