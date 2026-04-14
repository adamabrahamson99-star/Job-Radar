/**
 * Shared helper for Next.js → FastAPI proxy calls.
 *
 * Automatically prepends NEXT_PUBLIC_API_URL and injects the two internal
 * auth headers required by every FastAPI endpoint:
 *   X-Internal-User-ID  — the authenticated user's database ID
 *   X-Internal-Secret   — shared secret matching INTERNAL_API_SECRET on FastAPI
 *
 * Usage:
 *   const resp = await backendFetch("/api/jobs/run-check", userId, {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify({ user_id: userId }),
 *     signal: AbortSignal.timeout(10_000),
 *   });
 */

export function backendFetch(
  path: string,
  userId: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const secret = process.env.INTERNAL_API_SECRET ?? "";

  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      "X-Internal-User-ID": userId,
      "X-Internal-Secret": secret,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

/** Returns the raw INTERNAL_API_SECRET — useful for guard checks before sending. */
export const getInternalSecret = (): string =>
  process.env.INTERNAL_API_SECRET ?? "";
