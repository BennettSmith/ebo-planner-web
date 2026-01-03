export type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  path?: string;
  maxAgeSeconds?: number;
};

export function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  const parts = header.split(";").map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    out[name] = decodeURIComponent(value);
  }
  return out;
}

export function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const enc = encodeURIComponent(value);
  const pieces: string[] = [`${name}=${enc}`];
  pieces.push(`Path=${opts.path ?? "/"}`);
  if (opts.maxAgeSeconds !== undefined) pieces.push(`Max-Age=${opts.maxAgeSeconds}`);
  if (opts.httpOnly) pieces.push("HttpOnly");
  if (opts.secure) pieces.push("Secure");
  if (opts.sameSite) pieces.push(`SameSite=${opts.sameSite}`);
  return pieces.join("; ");
}


