import type { Env } from "../../../_worker";
import { requireBaseUrl } from "./oidc";

export function sanitizeReturnToPath(env: Env, raw: string | null | undefined): string {
  if (!raw) return "/";

  const base = new URL(requireBaseUrl(env));

  try {
    // Allow passing either an absolute URL or a path ("/trip.html?tripId=...").
    const u = raw.startsWith("/") ? new URL(raw, base) : new URL(raw);
    if (u.origin !== base.origin) return "/";
    return `${u.pathname}${u.search}` || "/";
  } catch {
    // Try interpreting as a relative URL (e.g. "trip.html?tripId=...").
    try {
      const u = new URL(raw, base);
      if (u.origin !== base.origin) return "/";
      return `${u.pathname}${u.search}` || "/";
    } catch {
      return "/";
    }
  }
}


