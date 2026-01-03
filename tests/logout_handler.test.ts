import { describe, expect, it, vi } from "vitest";

vi.mock("../functions/_lib/session", () => ({
  loadSession: vi.fn(async () => ({ sessionId: "sid", session: {}, setCookieHeader: undefined })),
  deleteSession: vi.fn(async () => {}),
  clearSessionCookie: vi.fn(() => "bff_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax"),
}));

vi.mock("../functions/_lib/oidc", () => ({
  clearOAuthCookie: vi.fn(() => "__Host-ebo_oauth=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax"),
}));

import { handleLogout } from "../functions/auth/logout";

describe("auth/logout", () => {
  it("deletes session and clears cookies", async () => {
    const res = await handleLogout(new Request("https://x/auth/logout", { method: "POST" }), {} as any);
    expect(res.status).toBe(204);
    const setCookie = res.headers.get("Set-Cookie")!;
    expect(setCookie).toContain("bff_session=");
  });
});


