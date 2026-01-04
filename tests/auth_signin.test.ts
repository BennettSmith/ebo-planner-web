import { describe, expect, it } from "vitest";
import { handleSignin } from "../functions/auth/signin";

describe("/auth/signin handler", () => {
  const env = { BASE_URL: "https://example.com" } as any;

  it("renders links with sanitized returnTo (same-origin)", async () => {
    const res = await handleSignin(new Request("https://x/auth/signin?returnTo=https://example.com/trip.html?tripId=t1"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain('/auth/google/login?returnTo=%2Ftrip.html%3FtripId%3Dt1');
    expect(html).toContain('/auth/apple/login?returnTo=%2Ftrip.html%3FtripId%3Dt1');
  });

  it("rejects cross-origin returnTo and defaults to /", async () => {
    const res = await handleSignin(new Request("https://x/auth/signin?returnTo=https://evil.example.com/pwn"), env);
    const html = await res.text();
    expect(html).toContain('/auth/google/login?returnTo=%2F');
  });
});


