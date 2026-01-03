import { describe, expect, it, vi } from "vitest";

vi.mock("../functions/_lib/session", () => ({
  loadSession: vi.fn(async () => ({
    sessionId: "sid",
    session: {},
    setCookieHeader: "bff_session=sid; Path=/; HttpOnly; Secure; SameSite=Lax",
  })),
  saveSession: vi.fn(async () => {}),
}));

vi.mock("../functions/_lib/tokens", () => ({
  ensureAccessToken: vi.fn(async () => ({ accessToken: "AT", updatedSession: { accessToken: "AT" } })),
}));

import { handleGetMembersMe } from "../functions/api/members/me";
import { ensureAccessToken } from "../functions/_lib/tokens";

describe("/api/members/me handler", () => {
  it("proxies to planner /members/me with bearer token and forwards Set-Cookie", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(_url).toBe("https://planner.example/members/me");
      expect((init.headers as any).Authorization).toBe("Bearer AT");
      return new Response(JSON.stringify({ member: { memberId: "m1", displayName: "x", email: "e@e.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json", Connection: "keep-alive" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const env = { PLANNER_BASE_URL: "https://planner.example/" } as any;
    const res = await handleGetMembersMe(new Request("https://x/api/members/me"), env, {} as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Connection")).toBeNull();
    const setCookie = res.headers.get("Set-Cookie")!;
    expect(setCookie).toContain("bff_session=sid");
  });

  it("returns 401 when unauthenticated", async () => {
    (ensureAccessToken as any).mockImplementationOnce(async () => {
      throw new Error("UNAUTHENTICATED");
    });

    const env = { PLANNER_BASE_URL: "https://planner.example" } as any;
    const res = await handleGetMembersMe(new Request("https://x/api/members/me"), env, {} as any);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("returns 500 on unexpected token error", async () => {
    (ensureAccessToken as any).mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    const env = { PLANNER_BASE_URL: "https://planner.example" } as any;
    const res = await handleGetMembersMe(new Request("https://x/api/members/me"), env, {} as any);
    expect(res.status).toBe(500);
  });
});


