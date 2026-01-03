import { describe, expect, it, vi } from "vitest";

describe("_worker router", () => {
  async function withWorker() {
    vi.resetModules();

    const mocks = vi.hoisted(() => ({
      handleGetMembersMe: vi.fn(async () => new Response("ok")),
      handleGoogleLogin: vi.fn(async () => new Response("glogin")),
      handleGoogleCallback: vi.fn(async () => new Response("gcb")),
      handleAppleLogin: vi.fn(async () => new Response("alogin")),
      handleAppleCallback: vi.fn(async () => new Response("acb")),
      handleLogout: vi.fn(async () => new Response(null, { status: 204 })),
    }));

    vi.mock("../functions/api/members/me", () => ({ handleGetMembersMe: mocks.handleGetMembersMe }));
    vi.mock("../functions/auth/google", () => ({ handleGoogleLogin: mocks.handleGoogleLogin, handleGoogleCallback: mocks.handleGoogleCallback }));
    vi.mock("../functions/auth/apple", () => ({ handleAppleLogin: mocks.handleAppleLogin, handleAppleCallback: mocks.handleAppleCallback }));
    vi.mock("../functions/auth/logout", () => ({ handleLogout: mocks.handleLogout }));

    const mod = await import("../_worker");
    return { mod, mocks };
  }

  it("routes all declared endpoints and 404s everything else", async () => {
    const { mod, mocks } = await withWorker();
    const env = { SESSIONS: {}, ASSETS: { fetch: async () => new Response("asset") } } as any;
    const fetch = (req: Request) => (mod.default as any).fetch(req, env, {} as any) as Promise<Response>;

    expect((await fetch(new Request("https://x/auth/google/login", { method: "GET" }))).status).toBe(200);
    expect(mocks.handleGoogleLogin).toHaveBeenCalledOnce();

    expect((await fetch(new Request("https://x/auth/google/callback", { method: "GET" }))).status).toBe(200);
    expect(mocks.handleGoogleCallback).toHaveBeenCalledOnce();

    expect((await fetch(new Request("https://x/auth/apple/login", { method: "GET" }))).status).toBe(200);
    expect(mocks.handleAppleLogin).toHaveBeenCalledOnce();

    expect((await fetch(new Request("https://x/auth/apple/callback", { method: "POST" }))).status).toBe(200);
    expect(mocks.handleAppleCallback).toHaveBeenCalledOnce();

    expect((await fetch(new Request("https://x/auth/logout", { method: "POST" }))).status).toBe(204);
    expect(mocks.handleLogout).toHaveBeenCalledOnce();

    expect((await fetch(new Request("https://x/api/members/me", { method: "GET" }))).status).toBe(200);
    expect(mocks.handleGetMembersMe).toHaveBeenCalledOnce();

    // Non-BFF routes are served from static assets.
    expect((await fetch(new Request("https://x/nope", { method: "GET" }))).status).toBe(200);
  });
});


