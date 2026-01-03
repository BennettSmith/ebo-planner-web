import { describe, expect, it, vi } from "vitest";

vi.mock("../src/worker/lib/oidc", () => ({
  makeState: () => "STATE",
  makeNonce: () => "NONCE",
  requireBaseUrl: () => "https://example.com",
  setOAuthCookie: () => "__Host-ebo_oauth=xyz; Path=/; HttpOnly; Secure; SameSite=Lax",
  clearOAuthCookie: () => "__Host-ebo_oauth=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
  readOAuthCookie: (req: Request) => {
    const mode = new URL(req.url).searchParams.get("m");
    if (mode === "missing") return null;
    return { v: 1, provider: "apple", state: "STATE", nonce: mode === "badnonce" ? "X" : "NONCE", createdAt: Date.now() };
  },
}));

vi.mock("../src/worker/lib/session", () => ({
  loadSession: vi.fn(async () => ({ sessionId: "sid", session: {}, setCookieHeader: "bff_session=sid; Path=/" })),
  saveSession: vi.fn(async () => {}),
}));

vi.mock("../src/worker/lib/authgenie", () => ({
  tokenExchangeWithIdToken: vi.fn(async () => ({ access_token: "AG_AT", token_type: "Bearer", expires_in: 60, refresh_token: "AG_RT", sub: "sub" })),
}));

// Mock jose: SignJWT chain + jwtVerify
vi.mock("jose", () => {
  class SignJWT {
    constructor(_p: any) {}
    setProtectedHeader(_h: any) { return this; }
    setIssuedAt(_t: any) { return this; }
    setExpirationTime(_t: any) { return this; }
    setIssuer(_i: any) { return this; }
    setAudience(_a: any) { return this; }
    setSubject(_s: any) { return this; }
    async sign(_k: any) { return "client_secret_jwt"; }
  }
  return {
    SignJWT,
    importPKCS8: vi.fn(async () => ({})),
    createRemoteJWKSet: () => ({}),
    jwtVerify: vi.fn(async (_jwt: string) => ({ payload: { nonce: "NONCE" } })),
  };
});

import { handleAppleCallback, handleAppleLogin } from "../functions/auth/apple";

function formReq(url: string, fields: Record<string, string>): Request {
  const body = new URLSearchParams(fields);
  return new Request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
}

describe("auth/apple", () => {
  it("login redirects to Apple with form_post and sets oauth cookie", async () => {
    const env = { APPLE_CLIENT_ID: "cid" } as any;
    const res = await handleAppleLogin(new Request("https://x/auth/apple/login"), env);
    expect(res.status).toBe(302);
    const loc = res.headers.get("Location")!;
    expect(loc).toContain("appleid.apple.com");
    expect(loc).toContain("response_mode=form_post");
    expect(loc).toContain("state=STATE");
    expect(loc).toContain("nonce=NONCE");
  });

  it("callback returns 400 when missing oauth cookie", async () => {
    const env = { APPLE_CLIENT_ID: "cid" } as any;
    const res = await handleAppleCallback(formReq("https://x/auth/apple/callback?m=missing", { state: "STATE", code: "123" }), env);
    expect(res.status).toBe(400);
  });

  it("callback returns 400 on oauth error", async () => {
    const env = { APPLE_CLIENT_ID: "cid" } as any;
    const res = await handleAppleCallback(formReq("https://x/auth/apple/callback", { state: "STATE", error: "access_denied" }), env);
    expect(res.status).toBe(400);
  });

  it("callback returns 400 when missing code", async () => {
    const env = { APPLE_CLIENT_ID: "cid" } as any;
    const res = await handleAppleCallback(formReq("https://x/auth/apple/callback", { state: "STATE" }), env);
    expect(res.status).toBe(400);
  });

  it("callback returns 502 when token exchange fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const env = { APPLE_CLIENT_ID: "cid", APPLE_TEAM_ID: "t", APPLE_KEY_ID: "k", APPLE_PRIVATE_KEY_P8: "p8" } as any;
    const res = await handleAppleCallback(formReq("https://x/auth/apple/callback", { state: "STATE", code: "123" }), env);
    expect(res.status).toBe(502);
  });

  it("callback returns 502 when id_token missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    const env = { APPLE_CLIENT_ID: "cid", APPLE_TEAM_ID: "t", APPLE_KEY_ID: "k", APPLE_PRIVATE_KEY_P8: "p8" } as any;
    const res = await handleAppleCallback(formReq("https://x/auth/apple/callback", { state: "STATE", code: "123" }), env);
    expect(res.status).toBe(502);
  });

  it("callback returns 400 when nonce mismatch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id_token: "id" }), { status: 200 })));
    const env = { APPLE_CLIENT_ID: "cid", APPLE_TEAM_ID: "t", APPLE_KEY_ID: "k", APPLE_PRIVATE_KEY_P8: "p8" } as any;
    const res = await handleAppleCallback(formReq("https://x/auth/apple/callback?m=badnonce", { state: "STATE", code: "123" }), env);
    expect(res.status).toBe(400);
  });

  it("callback redirects to / on success and passes Apple user metadata", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id_token: "id" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const env = { APPLE_CLIENT_ID: "cid", APPLE_TEAM_ID: "t", APPLE_KEY_ID: "k", APPLE_PRIVATE_KEY_P8: "p8" } as any;
    const res = await handleAppleCallback(
      formReq("https://x/auth/apple/callback", { state: "STATE", code: "123", user: JSON.stringify({ name: "n" }) }),
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
  });

  it("callback returns 400 when jwtVerify throws (invalid signature/exp/etc)", async () => {
    const jose = await import("jose");
    (jose.jwtVerify as any).mockImplementationOnce(async () => {
      throw new Error("bad jwt");
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id_token: "id" }), { status: 200 })));

    const env = { APPLE_CLIENT_ID: "cid", APPLE_TEAM_ID: "t", APPLE_KEY_ID: "k", APPLE_PRIVATE_KEY_P8: "p8" } as any;
    const res = await handleAppleCallback(formReq("https://x/auth/apple/callback", { state: "STATE", code: "123" }), env);
    expect(res.status).toBe(400);
  });
});


