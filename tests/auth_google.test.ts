import { describe, expect, it, vi } from "vitest";

// Mock OIDC helpers for deterministic state/nonce + cookies.
vi.mock("../functions/_lib/oidc", () => ({
  makeState: () => "STATE",
  makeNonce: () => "NONCE",
  requireBaseUrl: () => "https://example.com",
  setOAuthCookie: () => "__Host-ebo_oauth=xyz; Path=/; HttpOnly; Secure; SameSite=Lax",
  clearOAuthCookie: () => "__Host-ebo_oauth=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
  readOAuthCookie: (req: Request) => {
    // Use query param to drive branches.
    const u = new URL(req.url);
    const mode = u.searchParams.get("m");
    if (mode === "missing") return null;
    return { v: 1, provider: "google", state: "STATE", nonce: mode === "badnonce" ? "X" : "NONCE", createdAt: Date.now() };
  },
}));

// Mock session persistence.
vi.mock("../functions/_lib/session", () => ({
  loadSession: vi.fn(async () => ({ sessionId: "sid", session: {}, setCookieHeader: "bff_session=sid; Path=/" })),
  saveSession: vi.fn(async () => {}),
}));

// Mock AuthGenie exchange.
vi.mock("../functions/_lib/authgenie", () => ({
  tokenExchangeWithIdToken: vi.fn(async () => ({ access_token: "AG_AT", token_type: "Bearer", expires_in: 60, refresh_token: "AG_RT", sub: "sub" })),
}));

// Mock jose verification.
vi.mock("jose", () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: vi.fn(async (_jwt: string) => ({ payload: { nonce: "NONCE" } })),
}));

import { handleGoogleCallback, handleGoogleLogin } from "../functions/auth/google";

describe("auth/google", () => {
  it("login redirects to Google with state + nonce and sets oauth cookie", async () => {
    const env = { GOOGLE_CLIENT_ID: "cid" } as any;
    const res = await handleGoogleLogin(new Request("https://x/auth/google/login"), env);
    expect(res.status).toBe(302);
    const loc = res.headers.get("Location")!;
    expect(loc).toContain("accounts.google.com");
    expect(loc).toContain("state=STATE");
    expect(loc).toContain("nonce=NONCE");
    expect(res.headers.get("Set-Cookie")).toContain("__Host-ebo_oauth=");
  });

  it("callback returns 400 when missing oauth cookie", async () => {
    const env = { GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec" } as any;
    const res = await handleGoogleCallback(new Request("https://x/auth/google/callback?m=missing&state=STATE&code=123"), env);
    expect(res.status).toBe(400);
  });

  it("callback returns 400 when provider returns error", async () => {
    const env = { GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec" } as any;
    const res = await handleGoogleCallback(new Request("https://x/auth/google/callback?state=STATE&error=access_denied"), env);
    expect(res.status).toBe(400);
  });

  it("callback returns 400 when missing code", async () => {
    const env = { GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec" } as any;
    const res = await handleGoogleCallback(new Request("https://x/auth/google/callback?state=STATE"), env);
    expect(res.status).toBe(400);
  });

  it("callback returns 502 when Google token exchange fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const env = { GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec" } as any;
    const res = await handleGoogleCallback(new Request("https://x/auth/google/callback?state=STATE&code=123"), env);
    expect(res.status).toBe(502);
  });

  it("callback returns 502 when id_token missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    const env = { GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec" } as any;
    const res = await handleGoogleCallback(new Request("https://x/auth/google/callback?state=STATE&code=123"), env);
    expect(res.status).toBe(502);
  });

  it("callback returns 400 when nonce mismatch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id_token: "id" }), { status: 200 })));
    const env = { GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec" } as any;
    const res = await handleGoogleCallback(new Request("https://x/auth/google/callback?m=badnonce&state=STATE&code=123"), env);
    expect(res.status).toBe(400);
  });

  it("callback stores session and redirects to / on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id_token: "id" }), { status: 200 })));
    const env = { GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec" } as any;
    const res = await handleGoogleCallback(new Request("https://x/auth/google/callback?state=STATE&code=123"), env);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
  });

  it("callback returns 400 when jwtVerify throws (invalid signature/exp/etc)", async () => {
    const jose = await import("jose");
    (jose.jwtVerify as any).mockImplementationOnce(async () => {
      throw new Error("bad jwt");
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id_token: "id" }), { status: 200 })));

    const env = { GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec" } as any;
    const res = await handleGoogleCallback(new Request("https://x/auth/google/callback?state=STATE&code=123"), env);
    expect(res.status).toBe(400);
  });
});


